import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Shield } from 'lucide-react';
import { motion } from 'framer-motion';

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-background/90 backdrop-blur-md border-b border-border py-3 shadow-sm text-foreground'
          : 'bg-transparent py-5 text-white'
      }`}
    >
      <div className="container mx-auto px-6 md:px-12 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="bg-blue-600 text-white p-1.5 rounded-md group-hover:bg-blue-500 transition-colors">
            <Shield size={20} strokeWidth={2.5} />
          </div>
          <span className="font-display font-bold text-xl tracking-tight">
            Gov<span className="text-blue-500">Core</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <a href="#features" className={`text-sm font-medium transition-colors ${scrolled ? 'text-muted-foreground hover:text-foreground' : 'text-white/80 hover:text-white'}`}>
            Features
          </a>
          <a href="#security" className={`text-sm font-medium transition-colors ${scrolled ? 'text-muted-foreground hover:text-foreground' : 'text-white/80 hover:text-white'}`}>
            Security
          </a>
          <a href="#developers" className={`text-sm font-medium transition-colors ${scrolled ? 'text-muted-foreground hover:text-foreground' : 'text-white/80 hover:text-white'}`}>
            Developers
          </a>
        </nav>

        <div className="flex items-center gap-4">
          <Link href="/sign-in" className={`text-sm font-medium transition-colors hidden sm:block ${scrolled ? 'text-foreground hover:text-primary' : 'text-white hover:text-blue-200'}`}>
            Sign In
          </Link>
          <Link href="/sign-up">
            <Button className={`font-semibold shadow-md active-elevate hover-elevate border-none ${scrolled ? '' : 'bg-white text-blue-900 hover:bg-white/90'}`}>
              Request Access
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
