import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Shell } from '@/components/layout/Shell';

import Login from '@/pages/login';
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
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

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
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/verify/:uuid" component={DocumentVerify} />
      <Route component={AuthenticatedRoutes} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
