import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Redirect, Route, Switch, Router as WouterRouter } from 'wouter';
import { Shell } from '@/components/layout/Shell';

import Landing from '@/pages/landing';
import Dashboard from '@/pages/dashboard';
import TenantsList from '@/pages/tenants/list';
import TenantDetail from '@/pages/tenants/detail';
import UsersList from '@/pages/users/list';
import UserDetail from '@/pages/users/detail';
import RolesList from '@/pages/roles/list';
import RoleDetail from '@/pages/roles/detail';
import WorkflowsList from '@/pages/workflows/list';
import WorkflowDetail from '@/pages/workflows/detail';
import WorkflowInstanceDetail from '@/pages/workflow-instances/detail';
import WorkflowTasksInbox from '@/pages/workflow-tasks/inbox';
import FormsList from '@/pages/forms/list';
import FormDetail from '@/pages/forms/detail';
import FormFill from '@/pages/forms/fill';
import FormSubmissionsList from '@/pages/form-submissions/list';
import FormSubmissionDetail from '@/pages/form-submissions/detail';
import RulesList from '@/pages/rules/list';
import RuleDetail from '@/pages/rules/detail';
import RulesEvaluate from '@/pages/rules/evaluate';
import NotificationTemplatesList from '@/pages/notification-templates/list';
import NotificationTemplateDetail from '@/pages/notification-templates/detail';
import NotificationsList from '@/pages/notifications/list';
import NotificationDetail from '@/pages/notifications/detail';
import DocumentsList from '@/pages/documents/list';
import DocumentDetail from '@/pages/documents/detail';
import DocumentVerify from '@/pages/documents/verify';
import DocumentTemplatesList from '@/pages/document-templates/list';
import SearchPage from '@/pages/search';
import IntegrationsPage from '@/pages/integrations';
import ReportsList from '@/pages/reports/list';
import ReportDetail from '@/pages/reports/detail';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function SignInPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function HomeRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  if (isLoaded && isSignedIn) return <Redirect to="/dashboard" />;
  return <Landing />;
}

function AuthenticatedRoutes() {
  return (
    <Shell>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/tenants" component={TenantsList} />
        <Route path="/tenants/:id" component={TenantDetail} />
        <Route path="/users" component={UsersList} />
        <Route path="/users/:id" component={UserDetail} />
        <Route path="/roles" component={RolesList} />
        <Route path="/roles/:id" component={RoleDetail} />
        <Route path="/workflows" component={WorkflowsList} />
        <Route path="/workflows/:id" component={WorkflowDetail} />
        <Route path="/workflow-instances/:id" component={WorkflowInstanceDetail} />
        <Route path="/workflow-tasks" component={WorkflowTasksInbox} />
        <Route path="/forms" component={FormsList} />
        <Route path="/forms/:id/fill" component={FormFill} />
        <Route path="/forms/:id" component={FormDetail} />
        <Route path="/form-submissions" component={FormSubmissionsList} />
        <Route path="/form-submissions/:id" component={FormSubmissionDetail} />
        <Route path="/rules/evaluate" component={RulesEvaluate} />
        <Route path="/rules" component={RulesList} />
        <Route path="/rules/:id" component={RuleDetail} />
        <Route path="/notification-templates" component={NotificationTemplatesList} />
        <Route path="/notification-templates/:id" component={NotificationTemplateDetail} />
        <Route path="/notifications" component={NotificationsList} />
        <Route path="/notifications/:id" component={NotificationDetail} />
        <Route path="/document-templates" component={DocumentTemplatesList} />
        <Route path="/documents" component={DocumentsList} />
        <Route path="/documents/:id" component={DocumentDetail} />
        <Route path="/search" component={SearchPage} />
        <Route path="/integrations" component={IntegrationsPage} />
        <Route path="/reports" component={ReportsList} />
        <Route path="/reports/:id" component={ReportDetail} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function AuthTokenBridge() {
  const { getToken, isSignedIn } = useAuth();

  useEffect(() => {
    if (isSignedIn) {
      setAuthTokenGetter(() => getToken());
    } else {
      setAuthTokenGetter(null);
    }
  }, [isSignedIn, getToken]);

  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRoute} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/verify/:uuid" component={DocumentVerify} />
      <Route component={AuthenticatedRoutes} />
    </Switch>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProvider
        publishableKey={clerkPubKey}
        proxyUrl={clerkProxyUrl}
        signInUrl={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        appearance={{
          variables: {
            colorPrimary: '#2563eb',
            colorForeground: '#0f172a',
            colorMutedForeground: '#64748b',
            colorBackground: '#ffffff',
            colorInput: '#f8fafc',
            colorInputForeground: '#0f172a',
            colorNeutral: '#cbd5e1',
            borderRadius: '0.5rem',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
          },
          elements: {
            card: 'shadow-xl border border-slate-200',
            headerTitle: 'font-semibold text-slate-900',
            formButtonPrimary: 'bg-blue-600 hover:bg-blue-700',
          },
        }}
      >
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <AuthTokenBridge />
            <Router />
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </ClerkProvider>
    </WouterRouter>
  );
}

export default App;
