import { useEffect } from 'react';
import { motion, Variants } from 'framer-motion';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui/button';
import { 
  ShieldCheck, 
  Users, 
  Database, 
  KeyRound, 
  Activity, 
  Layers, 
  ChevronRight,
  Terminal
} from 'lucide-react';

const fadeIn: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

export default function Home() {
  return (
    <div className="min-h-screen bg-background font-sans">
      <Navbar />

      {/* HERO SECTION */}
      <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden bg-[#030A1C]">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-[#030A1C]/90 via-[#030A1C]/50 to-background z-10" />
          <img 
            src="/hero-bg.jpg" 
            alt="Abstract infrastructure" 
            className="w-full h-full object-cover opacity-50 mix-blend-overlay"
          />
        </div>
        
        <div className="container relative z-10 mx-auto px-6 md:px-12">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div 
              initial="hidden" animate="visible" variants={fadeIn}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 font-medium text-sm mb-6 border border-blue-500/20"
            >
              <ShieldCheck size={16} />
              <span>Modern Infrastructure for Modern Governance</span>
            </motion.div>
            
            <motion.h1 
              initial="hidden" animate="visible" variants={fadeIn} transition={{ delay: 0.1 }}
              className="text-5xl md:text-7xl font-display font-bold tracking-tight text-white leading-tight mb-6"
            >
              The Identity Engine for <br className="hidden md:block" />
              <span className="text-blue-400">Philippine LGUs</span>
            </motion.h1>
            
            <motion.p 
              initial="hidden" animate="visible" variants={fadeIn} transition={{ delay: 0.2 }}
              className="text-lg md:text-xl text-blue-100/70 mb-10 max-w-2xl mx-auto leading-relaxed"
            >
              Bulletproof identity infrastructure built for the real constraints of local government. Multi-tenant RBAC, JWT authentication, and full audit trails out of the box.
            </motion.p>
            
            <motion.div 
              initial="hidden" animate="visible" variants={fadeIn} transition={{ delay: 0.3 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Button size="lg" className="w-full sm:w-auto text-base h-14 px-8 shadow-lg bg-blue-600 hover:bg-blue-700 text-white border-none">
                Deploy GovCore Today
              </Button>
              <Button size="lg" variant="outline" className="w-full sm:w-auto text-base h-14 px-8 group bg-transparent border-blue-500/30 text-white hover:bg-blue-500/10">
                Read the Docs
                <ChevronRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* METRICS SECTION */}
      <section className="py-12 border-y border-border bg-card/50">
        <div className="container mx-auto px-6 md:px-12">
          <p className="text-center text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-8">
            Engineered for Municipal Scale
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div className="space-y-2">
              <h3 className="text-4xl font-display font-bold text-foreground">100%</h3>
              <p className="text-sm text-muted-foreground">On-Premise Ready</p>
            </div>
            <div className="space-y-2">
              <h3 className="text-4xl font-display font-bold text-foreground">&lt;50ms</h3>
              <p className="text-sm text-muted-foreground">Auth Latency</p>
            </div>
            <div className="space-y-2">
              <h3 className="text-4xl font-display font-bold text-foreground">Zero</h3>
              <p className="text-sm text-muted-foreground">Vendor Lock-in</p>
            </div>
            <div className="space-y-2">
              <h3 className="text-4xl font-display font-bold text-foreground">JWT</h3>
              <p className="text-sm text-muted-foreground">Stateless Sessions</p>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES GRID */}
      <section id="features" className="py-24 bg-background">
        <div className="container mx-auto px-6 md:px-12">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
              Infrastructure, Not Just Software
            </h2>
            <p className="text-lg text-muted-foreground">
              GovCore provides the foundational layers required to build secure citizen portals, internal tools, and public service apps.
            </p>
          </div>

          <motion.div 
            initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8"
          >
            {[
              {
                icon: Layers,
                title: "Multi-Tenant by Design",
                desc: "Isolate departments seamlessly. The Assessor's Office and the Mayor's Office can share the same backbone with zero data spillage."
              },
              {
                icon: KeyRound,
                title: "Role-Based Access",
                desc: "Granular permissions down to the action level. Define exactly who can view, edit, or approve municipal records."
              },
              {
                icon: Activity,
                title: "Immutable Audit Logs",
                desc: "Every login, every permission change, every data access is recorded. Built-in compliance for government auditing."
              },
              {
                icon: Database,
                title: "Stateless Architecture",
                desc: "JWT-based authentication means GovCore scales horizontally without breaking a sweat, even during tax season spikes."
              }
            ].map((feature, i) => (
              <motion.div key={i} variants={fadeIn} className="bg-card p-6 rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-6">
                  <feature.icon size={24} />
                </div>
                <h3 className="text-xl font-display font-semibold text-foreground mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed text-sm">
                  {feature.desc}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* SPLIT 1: SECURITY */}
      <section id="security" className="py-24 bg-card/30 overflow-hidden">
        <div className="container mx-auto px-6 md:px-12">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <motion.div 
              initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
              className="flex-1 space-y-6"
            >
              <div className="inline-flex items-center gap-2 text-secondary font-semibold text-sm uppercase tracking-wider mb-2">
                <ShieldCheck size={18} />
                Zero-Trust Security
              </div>
              <h2 className="text-3xl md:text-5xl font-display font-bold text-foreground leading-tight">
                Protect citizen data with military precision.
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Local governments are prime targets for cyberattacks. GovCore employs a defense-in-depth strategy, ensuring that every request is authenticated, authorized, and logged. 
              </p>
              <ul className="space-y-4 pt-4">
                {[
                  "Argon2 password hashing",
                  "Automated session invalidation",
                  "Brute-force protection out-of-the-box"
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-foreground font-medium">
                    <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
                      <ChevronRight size={14} />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
              className="flex-1 relative"
            >
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-transparent rounded-3xl blur-3xl -z-10" />
              <img src="/security-abstract.jpg" alt="Security Abstract" className="rounded-3xl shadow-2xl border border-border/50 object-cover w-full aspect-square" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* SPLIT 2: ARCHIPELAGO */}
      <section className="py-24 bg-background overflow-hidden">
        <div className="container mx-auto px-6 md:px-12">
          <div className="flex flex-col lg:flex-row-reverse items-center gap-16">
            <motion.div 
              initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
              className="flex-1 space-y-6"
            >
              <div className="inline-flex items-center gap-2 text-primary font-semibold text-sm uppercase tracking-wider mb-2">
                <Users size={18} />
                Built for the Philippines
              </div>
              <h2 className="text-3xl md:text-5xl font-display font-bold text-foreground leading-tight">
                Connecting an archipelago of 1,488 municipalities.
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Whether you're running a highly available cloud cluster in Metro Manila or a single on-premise server in a remote island province, GovCore is lightweight enough to run anywhere and robust enough to scale everywhere.
              </p>
              <div className="pt-6">
                <Button variant="outline" className="h-12 px-6">
                  View Deployment Topologies
                </Button>
              </div>
            </motion.div>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
              className="flex-1 relative"
            >
              <div className="absolute inset-0 bg-gradient-to-tl from-secondary/20 to-transparent rounded-3xl blur-3xl -z-10" />
              <img src="/lgu-network.jpg" alt="LGU Network" className="rounded-3xl shadow-2xl border border-border/50 object-cover w-full aspect-[4/3]" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* DEVELOPER EXPERIENCE */}
      <section id="developers" className="py-24 bg-foreground text-background">
        <div className="container mx-auto px-6 md:px-12">
          <div className="flex flex-col lg:flex-row gap-16 items-center">
            <div className="flex-1 space-y-6">
              <h2 className="text-3xl md:text-5xl font-display font-bold leading-tight text-white">
                Developer experience that doesn't feel like a government job.
              </h2>
              <p className="text-lg text-white/70 leading-relaxed">
                GovCore exposes a clean, predictable REST API that makes building citizen portals a breeze. Say goodbye to archaic SOAP endpoints and undocumented XML responses.
              </p>
              <div className="flex gap-4 pt-4">
                <Button className="bg-white text-foreground hover:bg-white/90 h-12 px-6">
                  <Terminal className="mr-2" size={18} />
                  API Reference
                </Button>
              </div>
            </div>
            <div className="flex-1 w-full">
              <div className="rounded-xl overflow-hidden bg-black border border-white/10 shadow-2xl">
                <div className="flex px-4 py-3 bg-white/5 border-b border-white/10 items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                  <span className="ml-4 text-xs font-mono text-white/50">POST /api/v1/auth/login</span>
                </div>
                <div className="p-6 overflow-x-auto">
                  <pre className="text-sm font-mono text-white/80 leading-relaxed">
                    <code>
<span className="text-blue-400">const</span> response = <span className="text-blue-400">await</span> fetch(<span className="text-green-400">'https://api.govcore.ph/v1/auth/login'</span>, {'{'}
  method: <span className="text-green-400">'POST'</span>,
  headers: {'{'} <span className="text-green-400">'Content-Type'</span>: <span className="text-green-400">'application/json'</span> {'}'},
  body: JSON.stringify({'{'}
    email: <span className="text-green-400">'mayor@municipality.gov.ph'</span>,
    password: <span className="text-green-400">'*******'</span>
  {'}'})
{'}'});

<span className="text-blue-400">const</span> {'{'} token, user {'}'} = <span className="text-blue-400">await</span> response.json();

<span className="text-gray-500">// Ready to access LGU resources</span>
console.log(<span className="text-green-400">`Welcome back, ${'{'}user.department{'}'}`</span>);
                    </code>
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-primary z-0" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 mix-blend-overlay z-0" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent z-0" />
        
        <div className="container relative z-10 mx-auto px-6 md:px-12 text-center">
          <motion.div 
            initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="max-w-3xl mx-auto space-y-8"
          >
            <h2 className="text-4xl md:text-6xl font-display font-bold text-white leading-tight">
              Ready to modernize your municipality?
            </h2>
            <p className="text-xl text-primary-foreground/80">
              Join the growing network of Philippine LGUs building their future on GovCore. Open source components available.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Button size="lg" className="bg-white text-primary hover:bg-white/90 h-14 px-8 text-base shadow-xl">
                Contact Sales Team
              </Button>
              <Button size="lg" className="bg-transparent border border-white/30 text-white hover:bg-white/10 h-14 px-8 text-base">
                Schedule Demo
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
