
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import { Toaster } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { useAdminAuth } from '@/hooks/useAdminAuth'
import { LoginButton } from '@/components/auth/LoginButton'
import { UserMenu } from '@/components/auth/UserMenu'
import { AdminProtectedRoute } from '@/components/auth/AdminProtectedRoute'
import { Button } from '@/components/ui/button'
import { Plus, Shield, Flame } from 'lucide-react'
import { AuthPromptProvider, useAuthPrompt } from '@/contexts/AuthPromptContext'
import { ErrorProvider } from '@/contexts/ErrorContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { AuthProvider } from '@/contexts/AuthContext'
import { RealtimeVotesProvider } from '@/contexts/RealtimeVotesContext'
import { GitHubPopupButton } from '@/components/GitHubPopupButton'
import { setSentryUser } from '@/lib/sentry'

// Lazy load all pages for code splitting
const HomePage = lazy(() => import('@/pages/HomePage').then(module => ({ default: module.HomePage })))
const SubmitProjectPage = lazy(() => import('@/pages/SubmitProjectPage').then(module => ({ default: module.SubmitProjectPage })))
const ProjectDetailPage = lazy(() => import('@/pages/ProjectDetailPage').then(module => ({ default: module.ProjectDetailPage })))
const UserProfilePage = lazy(() => import('@/pages/UserProfilePage').then(module => ({ default: module.UserProfilePage })))
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then(module => ({ default: module.DashboardPage })))
const EditProfilePage = lazy(() => import('@/pages/EditProfilePage').then(module => ({ default: module.EditProfilePage })))
const EditProjectPage = lazy(() => import('@/pages/EditProjectPage').then(module => ({ default: module.EditProjectPage })))
const CollectionsPage = lazy(() => import('@/pages/CollectionsPage').then(module => ({ default: module.CollectionsPage })))
const CollectionViewPage = lazy(() => import('@/pages/CollectionViewPage').then(module => ({ default: module.CollectionViewPage })))
const NewCollectionPage = lazy(() => import('@/pages/NewCollectionPage').then(module => ({ default: module.NewCollectionPage })))
const EditCollectionPage = lazy(() => import('@/pages/EditCollectionPage').then(module => ({ default: module.EditCollectionPage })))
const AddProjectsToCollectionPage = lazy(() => import('@/pages/AddProjectsToCollectionPage').then(module => ({ default: module.AddProjectsToCollectionPage })))
const DiscoverCollectionsPage = lazy(() => import('@/pages/DiscoverCollectionsPage').then(module => ({ default: module.DiscoverCollectionsPage })))
const BookmarksPage = lazy(() => import('@/pages/BookmarksPage').then(module => ({ default: module.BookmarksPage })))
const TrendingPage = lazy(() => import('@/pages/TrendingPage').then(module => ({ default: module.TrendingPage })))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then(module => ({ default: module.NotFoundPage })))
const AdminDashboardPage = lazy(() => import('@/pages/AdminDashboardPage').then(module => ({ default: module.AdminDashboardPage })))

// Preload critical routes for better UX
const preloadRoute = (importFn: () => Promise<unknown>) => {
  const componentImport = importFn()
  return componentImport
}

// Preload most visited routes after initial load (only if user interacts)
if (typeof window !== 'undefined') {
  let preloaded = false
  const preloadOnInteraction = () => {
    if (!preloaded) {
      preloaded = true
      preloadRoute(() => import('@/pages/SubmitProjectPage'))
      preloadRoute(() => import('@/pages/ProjectDetailPage'))
      preloadRoute(() => import('@/pages/TrendingPage'))
    }
  }

  // Preload on first user interaction instead of timeout
  document.addEventListener('click', preloadOnInteraction, { once: true })
  document.addEventListener('scroll', preloadOnInteraction, { once: true })
}

// Loading component for Suspense fallback
const PageLoader = () => <LoadingSpinner className="min-h-screen" />

// Protected route component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth()
  const location = useLocation()
  const { showAuthPrompt } = useAuthPrompt()

  // Show auth prompt after render completes, not during render
  useEffect(() => {
    if (!loading && !user && location.pathname !== '/') {
      showAuthPrompt('access this page')
    }
  }, [user, loading, location.pathname, showAuthPrompt])

  // Always wait for authentication to complete, regardless of localStorage
  // This prevents race conditions during OAuth callbacks and session establishment
  if (loading) {
    return <LoadingSpinner message="Checking authentication..." className="min-h-screen" />
  }

  // Redirect to home if not authenticated after loading completes
  if (!user) {
    return <Navigate to="/" replace state={{ from: location }} />
  }

  return <>{children}</>
}

function AppContent() {
  const { user, profile, error, loading, retryAuth } = useAuth()
  const { isAdmin } = useAdminAuth()

  // Tag Sentry events with the current user (id + username only, no PII)
  useEffect(() => {
    setSentryUser(user ? { id: user.id, username: profile?.username ?? null } : null)
  }, [user, profile])

  // Show error state with retry option if auth fails
  if (error && error.includes('timed out')) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 mb-4">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Authentication Timeout</h2>
          <p className="text-gray-600 mb-6">
            The authentication check is taking longer than expected. This might be due to a network issue or server problem.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={retryAuth}
              disabled={loading}
              className="bg-uiuc-orange hover:bg-uiuc-orange/90 text-white"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Retrying...
                </>
              ) : (
                'Retry Authentication'
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Refresh Page
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Don't block rendering for auth loading
  // The page should render immediately with or without auth


  return (
    <div className="min-h-screen bg-background">
      {/* Debug panel in development */}
      {import.meta.env.DEV && (
        <div className="fixed bottom-4 right-4 bg-black/80 text-white text-xs p-2 rounded z-50 max-w-xs">
          <div>User: {user?.email || 'None'}</div>
          <div>Loading: {loading ? 'Yes' : 'No'}</div>
          <div>Error: {error ? error.substring(0, 30) + '...' : 'None'}</div>
        </div>
      )}

      {/* Skip to content for accessibility */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[60] focus:bg-neon-orange focus:text-white focus:px-4 focus:py-3 focus:rounded-lg focus:shadow-lg focus:shadow-neon-orange/50 focus:ring-2 focus:ring-white/50">
        Skip to content
      </a>

      <header className="sticky top-0 left-0 right-0 z-50 glass-premium border-b border-white/10 shadow-xl">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo/Branding */}
            <Link to="/" className="flex items-center gap-3 group">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-neon-orange to-orange-600 shadow-lg shadow-neon-orange/30 group-hover:scale-110 transition-transform duration-300">
                <span className="text-xl font-bold text-white">I</span>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white group-hover:text-neon-orange transition-colors">
                  IlliniHunt
                </h1>
                <p className="text-slate-400 text-xs hidden sm:block">Discover innovation at Illinois</p>
              </div>
            </Link>

            {/* Navigation */}
            <nav className="flex items-center gap-2 sm:gap-3">
              {user && (
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="hidden md:inline-flex glass-premium hover:bg-white/10 text-slate-200 hover:text-white border-0 h-10"
                >
                  <Link to="/dashboard" className="flex items-center gap-2">
                    Dashboard
                  </Link>
                </Button>
              )}

              {isAdmin && (
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="hidden md:inline-flex glass-premium hover:bg-orange-500/20 text-orange-300 hover:text-orange-200 border-0 h-10"
                >
                  <Link to="/admin" className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Admin
                  </Link>
                </Button>
              )}

              <Button
                asChild
                variant="ghost"
                size="sm"
                className="hidden md:inline-flex glass-premium hover:bg-neon-orange/20 text-slate-200 hover:text-neon-orange border-0 h-10"
              >
                <Link to="/trending" className="flex items-center gap-2">
                  <Flame className="w-4 h-4" />
                  Trending
                </Link>
              </Button>

              <Button
                asChild
                variant="outline"
                size="sm"
                className="glass-premium hover:bg-neon-orange/20 text-slate-200 hover:text-white border-white/10 hover:border-neon-orange/50 h-10 transition-all duration-300"
              >
                <Link to="/submit" className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Submit Project</span>
                  <span className="sm:hidden">Submit</span>
                </Link>
              </Button>

              {user ? <UserMenu /> : <LoginButton />}
            </nav>
          </div>
        </div>
      </header>

      <main id="main-content">
        {error && (
          <div className="container mx-auto px-4 pt-4">
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              <p className="font-semibold">Authentication Error</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}

        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/trending" element={<TrendingPage />} />
            <Route
              path="/submit"
              element={
                <ProtectedRoute>
                  <SubmitProjectPage />
                </ProtectedRoute>
              }
            />
            <Route path="/project/:id" element={<ProjectDetailPage />} />
            <Route path="/user/:id" element={<UserProfilePage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile/edit"
              element={
                <ProtectedRoute>
                  <EditProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/project/:id/edit"
              element={
                <ProtectedRoute>
                  <EditProjectPage />
                </ProtectedRoute>
              }
            />
            {/* Backwards compatibility for older edit links */}
            <Route
              path="/edit-project/:id"
              element={
                <ProtectedRoute>
                  <EditProjectPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/collections"
              element={
                <ProtectedRoute>
                  <CollectionsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/collections/new"
              element={
                <ProtectedRoute>
                  <NewCollectionPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/bookmarks"
              element={
                <ProtectedRoute>
                  <BookmarksPage />
                </ProtectedRoute>
              }
            />
            <Route path="/collections/discover" element={<DiscoverCollectionsPage />} />
            <Route path="/collections/:id" element={<CollectionViewPage />} />
            <Route
              path="/collections/:id/edit"
              element={
                <ProtectedRoute>
                  <EditCollectionPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/collections/:id/add-projects"
              element={
                <ProtectedRoute>
                  <AddProjectsToCollectionPage />
                </ProtectedRoute>
              }
            />
            {/* Admin route */}
            <Route
              path="/admin"
              element={
                <AdminProtectedRoute>
                  <AdminDashboardPage />
                </AdminProtectedRoute>
              }
            />
            {/* Fallback route */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ErrorProvider>
          <AuthProvider>
            <AuthPromptProvider>
              <RealtimeVotesProvider>
                <AppContent />
                <GitHubPopupButton />
                <Toaster
                  position="top-right"
                  richColors
                  closeButton
                  visibleToasts={4}
                  toastOptions={{
                    duration: 4000,
                    classNames: {
                      toast: 'group toast group-[.toaster]:bg-white group-[.toaster]:border group-[.toaster]:shadow-lg',
                      description: 'group-[.toast]:text-gray-600',
                      actionButton: 'group-[.toast]:bg-uiuc-orange group-[.toast]:text-white',
                      cancelButton: 'group-[.toast]:bg-gray-100 group-[.toast]:text-gray-600',
                      closeButton: 'group-[.toast]:bg-gray-200 group-[.toast]:border-none',
                    }
                  }}
                />
              </RealtimeVotesProvider>
            </AuthPromptProvider>
          </AuthProvider>
        </ErrorProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
