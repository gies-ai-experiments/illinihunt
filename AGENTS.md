# AGENTS.md

> ### ⚠️ Stale as of 2026-08-23 — read this first
>
> This file describes the **pre-migration Supabase stack**. IlliniHunt now runs on Azure:
> Express + Prisma against Azure Postgres, Entra ID (MSAL) auth, Azure Blob storage, Azure
> Static Web Apps. The Supabase project `catzwowmxluzwbhdyhnf` has been **deleted** (issue #93),
> so every `npx supabase` / `mcp__supabase__*` command below will fail, and the RLS and Google
> OAuth guidance no longer describes the running system — authorization lives in the Express
> handlers now.
>
> **The current stack is documented on the `azure-migration` branch** (its `CLAUDE.md` and
> `docs/superpowers/specs/2026-05-26-azure-migration-design.md`). Treat this file as history.

## Project Overview

IlliniHunt V2 is a Product Hunt-style platform for the University of Illinois community to showcase projects, apps, and startups. This file provides instructions for AI agents working with this codebase.

## Project Structure

```
illinihunt/
├── src/                      # React TypeScript application
│   ├── App.tsx              # Main app component with routing
│   ├── components/          # Reusable UI components
│   │   ├── auth/           # Authentication components
│   │   ├── project/        # Project-related components
│   │   ├── comment/        # Comment system components
│   │   └── ui/             # Base UI components (shadcn/ui)
│   ├── contexts/           # React context providers
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Library configurations
│   │   ├── supabase.ts     # Supabase client setup
│   │   ├── database.ts     # Database service layer
│   │   └── types/database.ts # Generated TypeScript types
│   └── pages/              # Page components
├── public/                  # Static assets
├── supabase/               # Supabase configuration
│   └── migrations/         # Database migrations
└── package.json            # Node.js dependencies
```

## Code Style and Conventions

### TypeScript Requirements
- Use TypeScript strict mode
- Avoid `any` types where possible
- Properly type all function parameters and return values
- Use interfaces for object shapes, types for unions/aliases

### React Patterns
- Use functional components with hooks
- Prefer named exports for components
- Use custom hooks for business logic
- Implement proper error boundaries
- Follow React 18 best practices

### Naming Conventions
- Components: PascalCase (e.g., `ProjectCard.tsx`)
- Hooks: camelCase with 'use' prefix (e.g., `useAuth.ts`)
- Utilities: camelCase (e.g., `formatDate.ts`)
- Constants: UPPER_SNAKE_CASE (e.g., `MAX_UPLOAD_SIZE`)
- CSS classes: Tailwind utility classes only

### File Organization
- One component per file
- Group related components in folders
- Keep components close to where they're used
- Shared components in `components/ui`

## Testing Instructions

### Build Verification
```bash
# Always run these checks before committing:
npm run type-check    # TypeScript compilation check
npm run lint          # ESLint validation
npm run build         # Production build test
```

### Local Development
```bash
# Start development server
npm run dev

# The app should be accessible at http://localhost:5173
```

### Database Changes
```bash
# HISTORICAL — Supabase is gone. On azure-migration the schema is Prisma:
#   cd api && npm run prisma:pull && npm run prisma:generate
npm run type-check
```

## Authentication Requirements

- Only @illinois.edu email addresses are allowed
- Google OAuth is the primary authentication method
- All authenticated routes must use the `ProtectedRoute` component
- Check authentication state using the `useAuth` hook

## Database Conventions

### Supabase Integration — RETIRED
- Project `catzwowmxluzwbhdyhnf` was deleted (#93). The points below are historical.
- Always use Row Level Security (RLS) policies
- Use generated TypeScript types from `src/lib/types/database.ts`
- Implement optimistic updates for better UX

### Query Patterns
```typescript
// Always handle errors properly
const { data, error } = await supabase
  .from('table_name')
  .select('*')
  
if (error) {
  console.error('Error:', error)
  // Handle error appropriately
}
```

## UI/UX Guidelines

### Design System
- **See [src/docs/DESIGN_SYSTEM.md](src/docs/DESIGN_SYSTEM.md) for complete specifications**
- Primary colors: UIUC Orange (#FF6B35), UIUC Blue (#13294B)
- Use shadcn/ui components as base
- Follow Tailwind CSS utility-first approach
- Ensure mobile responsiveness

### Component Library
- Base components from `@radix-ui`
- Icons from `lucide-react`
- Forms with `react-hook-form` and `zod` validation
- Toast notifications for user feedback

## Performance Requirements

### Bundle Size
- Keep total bundle under 800 kB
- Use dynamic imports for large components
- Implement code splitting for routes

### Build Metrics
- TypeScript compilation: < 5 seconds
- Build time: < 10 seconds
- First Contentful Paint: < 1.8s
- Largest Contentful Paint: < 2.5s

### Data Fetching Best Practices

**CRITICAL: Avoid Waterfall Loading**

Waterfall pattern (sequential fetches) causes slow page loads:
```typescript
// ❌ BAD: Each fetch waits for the previous one
useEffect(() => { loadAuth() }, [])           // 500ms
useEffect(() => { if (auth) loadData() }, [auth])    // 300ms
useEffect(() => { if (data) loadMore() }, [data])    // 200ms
// Total: 1000ms 🐌
```

**Use Parallel Loading + Caching**:
```typescript
// ✅ GOOD: Load in parallel, use cached data
const { categories } = useCategories()  // Cached (instant)
const { user } = useAuth()              // Parallel

useEffect(() => {
  if (user) loadData()  // Only wait for auth
}, [user])
// Total: 500-700ms ⚡
```

**Cached Hooks Available:**
- `useCategories()` - Categories with 5-min cache
- Add more for other static/slow-changing data

**When to create a cached hook:**
1. Data rarely changes (like categories, config)
2. Data is used across multiple pages
3. Fetching is slow (> 100ms)

**Pattern:**
```typescript
// src/hooks/useCachedData.ts
let cache: Data[] | null = null
let cacheTime: number | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export function useCachedData() {
  const [data, setData] = useState(cache || [])
  const [loading, setLoading] = useState(!cache)

  useEffect(() => {
    const now = Date.now()
    if (cache && cacheTime && now - cacheTime < CACHE_TTL) {
      return // Use cache
    }
    // Fetch and cache...
  }, [])

  return { data, loading }
}
```

## Security Guidelines

### Environment Variables
- Never commit `.env` files
- Use `VITE_` prefix for client-side variables
- Validate all environment variables at startup

### Data Validation
- Sanitize all user inputs
- Use Zod schemas for form validation
- Implement proper CORS policies
- Follow OWASP security best practices

## Deployment

### Production Deployment
- **Primary**: https://illinihunt.org (Cloudflare CDN + Vercel)
- **Vercel Direct**: https://illinihunt.vercel.app
- Automatic deployment via Vercel on `main` branch push
- Cloudflare proxy enabled for caching and DDoS protection
- Environment variables managed in Vercel dashboard

### Post-deployment Steps
1. **Purge Cloudflare cache** after deployments (critical!)
   - Login to Cloudflare dashboard
   - Select `illinihunt.org` domain
   - Go to: Caching → Configuration → Purge Everything
   - Wait 30 seconds for propagation
2. Test on all browsers (Chrome, Firefox, Safari)
3. Verify no MIME type errors in browser console

### Pre-deployment Checklist
1. Run `npm run type-check`
2. Run `npm run build`
3. Remove all `console.log` statements
4. Verify no hardcoded secrets
5. Test authentication flow
6. Check responsive design
7. Don't modify `vercel.json` rewrite pattern without testing

## PR Message Guidelines

When creating pull requests:
1. Use conventional commit format (feat:, fix:, chore:, etc.)
2. Include brief description of changes
3. Reference any related issues
4. List breaking changes if any
5. Include testing instructions

## Common Commands

```bash
# Development
npm install           # Install dependencies
npm run dev          # Start dev server
npm run build        # Build for production
npm run preview      # Preview production build

# Code Quality
npm run type-check   # TypeScript validation
npm run lint         # ESLint check
npm run lint:fix     # Auto-fix linting issues

# Database (azure-migration branch — Supabase project is deleted)
cd api && npm run prisma:pull       # re-introspect Azure Postgres
cd api && npm run prisma:generate
```

## Troubleshooting

### Common Issues

1. **Site works in Firefox but fails in Chrome/Safari**
   - **Symptom**: "Expected JavaScript but got text/html" MIME type errors
   - **Cause**: Cloudflare CDN caching old broken responses
   - **Solution**: Purge Cloudflare cache (see Post-deployment Steps above)
   - **Prevention**: Always purge cache after Vercel deployments
   - **Note**: The `vercel.json` rewrite pattern `/:path((?!.*\\.).*)` is critical for Cloudflare compatibility

2. **Port already in use**
   ```bash
   npx kill-port 5173
   # or
   npm run dev -- --port 3000
   ```

3. **Type errors after schema change**
   - Regenerate types: `cd api && npm run prisma:pull && npm run prisma:generate` (Supabase codegen is dead)
   - Clear TypeScript cache: `rm -rf node_modules/.cache`
   - Run `npm run type-check` to verify

4. **Authentication failures**
   - Verify @illinois.edu email restriction
   - Check Supabase environment variables
   - Ensure Google OAuth is configured
   - Check redirect URLs in Google Cloud Console and Supabase dashboard

5. **Build failures**
   - Clear node_modules and reinstall
   - Check for missing dependencies
   - Verify all imports resolve correctly
   - Ensure `vercel.json` routing pattern hasn't been modified

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Vite Documentation](https://vitejs.dev)
- [React Documentation](https://react.dev)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [shadcn/ui Components](https://ui.shadcn.com)

## Contact

For questions about project architecture or development guidelines, refer to the CLAUDE.md file or consult the project maintainers.

## Claude Memory Lookup

When prior context may matter, search Claude memories at runtime instead of copying memory content into this repo. Use this as a nudge, not a mandatory step for every tiny edit.

- Safe local roots: /Users/vishal/code, /Users/vishal/teaching, /Users/vishal/research, /Users/vishal/admin, /Users/vishal/vault.
- Do not search Box, iCloud, or other cloud-sync folders for this purpose.
- Start with global memory: /Users/vishal/.claude/memory/MEMORY.md and /Users/vishal/.claude/projects/-Users-vishal/memory/MEMORY.md.
- For the current project, derive the likely Claude memory folder from the path. Example: /Users/vishal/code/AgentLab -> /Users/vishal/.claude/projects/-Users-vishal-code-AgentLab/memory/.
- If the topic could cross projects, search relevant memory files with rg across /Users/vishal/.claude/projects/*/memory/*.md.
- Prefer memory pointers and summaries over duplicating long memory content here.

## External Actions Require Explicit Approval

Never publish, post, send, delete, deploy, submit, schedule, purchase, or otherwise take an external action without explicit approval from Vishal.

This includes LinkedIn, email, Slack/Teams, Canvas, GitHub PRs/issues/comments, deployments, forms, purchases, and browser-based actions that affect external systems.

Drafting is allowed. Composing into a browser editor is allowed only when asked. Stop before the final action button.

Before any external action, ask: "Do you want me to [exact action] now?" Only proceed after a clear yes to that exact action. Do not treat "looks good," "ok," or "use this" as permission to publish, send, delete, deploy, submit, schedule, purchase, or post.

For LinkedIn posts: prepare the text, optionally paste it into the composer, then stop. Never click Post unless Vishal explicitly says "Post it."
