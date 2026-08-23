#!/usr/bin/env bash
# Post-deploy verification for the agentic-readiness work.
# Every assertion is a real request against the live host. Exits non-zero on any failure.
set -uo pipefail

HOST="${1:-https://illinihunt.org}"
API="https://illinihunt.azurewebsites.net"
fail=0

chk() { # chk <label> <expected> <actual>
  if [ "$2" = "$3" ]; then printf '  ok   %-52s %s\n' "$1" "$3"
  else printf '  FAIL %-52s expected=%s got=%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
code() { curl -s -o /dev/null -w '%{http_code}' -m 25 "$1"; }
ctype() { curl -s -o /dev/null -w '%{content_type}' -m 25 "$1" | cut -d';' -f1; }

echo "== 1. Real 404s on unknown paths (was: 200 + app shell) =="
chk "/this-path-does-not-exist-xyz"      404 "$(code "$HOST/this-path-does-not-exist-xyz")"
chk "/deep/nested/nope"                  404 "$(code "$HOST/deep/nested/nope")"
chk "404 body is the agent-friendly page" 0 "$(curl -s -m 25 "$HOST/nope-xyz" | grep -qi 'llms.txt' && echo 0 || echo 1)"

echo "== 2. Every SPA route still resolves (regression guard for dropping navigationFallback) =="
for r in / /trending /submit /dashboard /bookmarks /admin /profile/edit \
         /project/5e2809d9-6f77-4c28-a405-1b53f71cf6e9 \
         /project/5e2809d9-6f77-4c28-a405-1b53f71cf6e9/edit \
         /edit-project/5e2809d9-6f77-4c28-a405-1b53f71cf6e9 \
         /user/d5d5ff73-47a2-4a26-83a4-0f96ab01d487 \
         /collections /collections/new /collections/discover \
         /collections/abc /collections/abc/edit /collections/abc/add-projects; do
  chk "SPA $r" 200 "$(code "$HOST$r")"
done

echo "== 3. Server-rendered content without JavaScript =="
home=$(curl -s -m 25 "$HOST/")
chars=$(printf '%s' "$home" | sed 's/<[^>]*>/ /g' | tr -s ' \n' ' ' | wc -c | tr -d ' ')
chk "homepage h1 in raw HTML"             0 "$(printf '%s' "$home" | grep -qi '<h1' && echo 0 || echo 1)"
chk "homepage raw text >= 500 chars"      0 "$([ "$chars" -ge 500 ] && echo 0 || echo 1)"
echo "       (raw text length: $chars)"
chk "JSON-LD present"                     0 "$(printf '%s' "$home" | grep -q 'application/ld+json' && echo 0 || echo 1)"
chk "JSON-LD parses"                      0 "$(printf '%s' "$home" | python3 -c "
import sys,re,json
m=re.search(r'<script type=\"application/ld\+json\">(.*?)</script>', sys.stdin.read(), re.S)
sys.exit(0 if m and json.loads(m.group(1)) else 1)" && echo 0 || echo 1)"
chk "no stale Supabase preconnect"        0 "$(printf '%s' "$home" | grep -q 'supabase.co' && echo 1 || echo 0)"

echo "== 4. Trust anchors and docs, server-rendered =="
for p in /about /contact /privacy /docs /developers; do
  body=$(curl -s -m 25 "$HOST$p")
  n=$(printf '%s' "$body" | sed 's/<[^>]*>/ /g' | tr -s ' \n' ' ' | wc -c | tr -d ' ')
  chk "$p 200"                            200 "$(code "$HOST$p")"
  chk "$p >= 500 chars of text"           0 "$([ "$n" -ge 500 ] && echo 0 || echo 1)"
done

echo "== 5. Machine-readable surfaces =="
chk "/llms.txt 200"                       200 "$(code "$HOST/llms.txt")"
chk "/llms.txt has when-to-use"           0 "$(curl -s -m 25 "$HOST/llms.txt" | grep -qi 'when to use' && echo 0 || echo 1)"
chk "/openapi.json 200"                   200 "$(code "$HOST/openapi.json")"
chk "/openapi.json is JSON"               application/json "$(ctype "$HOST/openapi.json")"
chk "/openapi.json parses + has ops"      0 "$(curl -s -m 25 "$HOST/openapi.json" | python3 -c "
import sys,json
d=json.load(sys.stdin)
ids=[o['operationId'] for v in d['paths'].values() for o in v.values()]
sys.exit(0 if len(ids)==12 and len(set(ids))==12 else 1)" && echo 0 || echo 1)"
chk "/.well-known/api-catalog 200"        200 "$(code "$HOST/.well-known/api-catalog")"
chk "/sitemap.xml 200"                    200 "$(code "$HOST/sitemap.xml")"
chk "/robots.txt mentions llms.txt"       0 "$(curl -s -m 25 "$HOST/robots.txt" | grep -qi 'llms.txt' && echo 0 || echo 1)"
for p in /about.md /contact.md /privacy.md /docs.md /developers.md; do
  chk "$p is text/markdown"               text/markdown "$(ctype "$HOST$p")"
done

echo "== 6. API index on the web host, real 404 for non-existent API paths =="
chk "$HOST/api is JSON"                   application/json "$(ctype "$HOST/api")"
chk "$HOST/api names the API base URL"    0 "$(curl -s -m 25 "$HOST/api" | python3 -c "
import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get('api_base_url')=='https://illinihunt.azurewebsites.net' else 1)" && echo 0 || echo 1)"
chk "$HOST/api/anything -> 404"           404 "$(code "$HOST/api/anything")"

echo "== 7. PII: no anonymous endpoint returns an email =="
ids=$(curl -s -m 30 "$API/api/projects?limit=100" | python3 -c "
import sys,json
print(' '.join(sorted({p['users']['id'] for p in json.load(sys.stdin)['projects'] if p.get('users')})[:10]))")
n=0; leaked=0
for i in $ids; do
  n=$((n+1))
  curl -s -m 20 "$API/api/users/$i" | grep -q '@illinois.edu' && leaked=$((leaked+1))
done
chk "profiles probed anonymously leak 0 emails (n=$n)" 0 "$leaked"
chk "positive control: harness CAN see an email"       0 "$(printf '%s' 'x@illinois.edu' | grep -q '@illinois.edu' && echo 0 || echo 1)"
chk "profile endpoint still returns a user"            0 "$(curl -s -m 20 "$API/api/users/d5d5ff73-47a2-4a26-83a4-0f96ab01d487" | python3 -c "
import sys,json; sys.exit(0 if json.load(sys.stdin).get('user',{}).get('username') else 1)" && echo 0 || echo 1)"

echo
if [ "$fail" -eq 0 ]; then echo "ALL CHECKS PASSED against $HOST"; else echo "$fail CHECK(S) FAILED against $HOST"; fi
exit "$fail"
