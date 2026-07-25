import { Shield } from 'lucide-react';
import { Link } from 'wouter';

export function Footer() {
  return (
    <footer className="bg-card border-t border-border pt-16 pb-8">
      <div className="container mx-auto px-6 md:px-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4 group">
              <div className="bg-primary text-primary-foreground p-1.5 rounded-md">
                <Shield size={20} strokeWidth={2.5} />
              </div>
              <span className="font-display font-bold text-xl tracking-tight text-foreground">
                Gov<span className="text-primary">Core</span>
              </span>
            </Link>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-xs">
              The Identity Engine for Philippine Local Government Units. Secure, modern, and built for the real constraints of local governance.
            </p>
          </div>
          
          <div>
            <h4 className="font-display font-semibold mb-4 text-foreground">Platform</h4>
            <ul className="space-y-3">
              <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Identity Management</a></li>
              <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">RBAC & Permissions</a></li>
              <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Audit Logging</a></li>
              <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">API Reference</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-display font-semibold mb-4 text-foreground">Resources</h4>
            <ul className="space-y-3">
              <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Documentation</a></li>
              <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Deployment Guides</a></li>
              <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Security Whitepaper</a></li>
              <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">LGU Case Studies</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-display font-semibold mb-4 text-foreground">Contact</h4>
            <ul className="space-y-3">
              <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Support</a></li>
              <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Sales</a></li>
              <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Partners</a></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-border pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} GovCore Systems. Designed for the Republic of the Philippines.
          </p>
          <div className="flex gap-4">
            <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy Policy</a>
            <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
