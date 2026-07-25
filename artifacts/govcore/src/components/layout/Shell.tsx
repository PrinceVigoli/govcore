import { useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useClerk, useAuth } from '@clerk/react';
import { useGetMe, getGetMeQueryKey } from '@workspace/api-client-react';
import { LayoutTemplate, Mail, Building2, Users, Shield, LayoutGrid, ScrollText, LogOut, Loader2, Landmark, GitBranch, ListChecks, FileText, ClipboardList, Scale, Bell, FolderOpen, Search, Plug, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/hooks/use-toast';

const navItems = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutGrid },
  { name: 'Tenants', path: '/tenants', icon: Building2 },
  { name: 'Users', path: '/users', icon: Users },
  { name: 'Roles', path: '/roles', icon: Shield },
  { name: 'Departments', path: '/departments', icon: Landmark },
  { name: 'Workflows', path: '/workflows', icon: GitBranch },
  { name: 'My Tasks', path: '/workflow-tasks', icon: ListChecks },
  { name: 'Forms', path: '/forms', icon: FileText },
  { name: 'Submissions', path: '/form-submissions', icon: ClipboardList },
  { name: 'Rules', path: '/rules', icon: Scale },
  { name: 'Notifications', path: '/notifications', icon: Bell },
  { name: 'Templates', path: '/notification-templates', icon: Mail },
  { name: 'Documents', path: '/documents', icon: FolderOpen },
  { name: 'Doc Templates', path: '/document-templates', icon: LayoutTemplate },
  { name: 'Search', path: '/search', icon: Search },
  { name: 'Integrations', path: '/integrations', icon: Plug },
  { name: 'Reports', path: '/reports', icon: BarChart3 },
  { name: 'Audit Logs', path: '/audit-logs', icon: ScrollText },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const { data: user, isLoading, isError } = useGetMe({
    query: {
      enabled: isLoaded && Boolean(isSignedIn),
      retry: false,
      queryKey: getGetMeQueryKey(),
    }
  });
  const { toast } = useToast();

  useEffect(() => {
    if (isLoaded && (!isSignedIn || isError)) {
      if (location !== '/sign-in') {
        setLocation('/sign-in');
      }
    }
  }, [isError, isLoaded, isSignedIn, location, setLocation]);

  const handleLogout = async () => {
    await signOut({ redirectUrl: basePath || '/' });
  };

  if (!isLoaded || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isSignedIn || !user) return null;

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar border-r border-border flex flex-col hidden md:flex shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border bg-sidebar">
          <Shield className="h-6 w-6 text-sidebar-primary mr-2" />
          <span className="text-lg font-bold text-sidebar-foreground tracking-tight">GovCore</span>
          <span className="ml-2 text-xs font-mono bg-sidebar-accent text-sidebar-accent-foreground px-1.5 py-0.5 rounded">ID</span>
        </div>
        
        <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            // Exact match, or a true sub-path — a bare startsWith would light
            // up "Forms" while the user is on /form-submissions.
            const active = location === item.path || location.startsWith(`${item.path}/`);
            return (
              <Link 
                key={item.path} 
                href={item.path}
                className={`flex items-center px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  active 
                    ? 'bg-sidebar-primary/10 text-sidebar-primary' 
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                }`}
                data-testid={`nav-${item.name.toLowerCase().replace(' ', '-')}`}
              >
                <item.icon className={`mr-3 h-5 w-5 shrink-0 ${active ? 'text-sidebar-primary' : 'text-sidebar-foreground/50'}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center min-w-0">
              <div className="h-8 w-8 rounded-full bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center font-bold text-xs">
                {user.firstName[0]}{user.lastName[0]}
              </div>
              <div className="ml-3 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-xs text-sidebar-foreground/60 truncate">
                  {user.email}
                </p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="p-1.5 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-md ml-2"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-muted/30 overflow-hidden">
        {/* Mobile Header */}
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 md:hidden shrink-0">
          <div className="flex items-center">
            <Shield className="h-6 w-6 text-primary mr-2" />
            <span className="text-lg font-bold">GovCore</span>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="h-5 w-5" />
          </Button>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto space-y-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
