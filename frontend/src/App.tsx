import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ClusterListPage from './pages/ClusterListPage';
import TopicListPage from './pages/TopicListPage';
import MessagePage from './pages/MessagePage';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-[#030508] text-[#e2e8f0] font-[var(--font-body)] relative">
          {/* Background grid pattern */}
          <div className="fixed inset-0 bg-grid-pattern pointer-events-none" />

          {/* Ambient glow */}
          <div className="fixed top-0 left-1/4 w-96 h-96 bg-amber-500/5 rounded-full blur-[120px] pointer-events-none" />
          <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-[120px] pointer-events-none" />

          {/* Top Navigation */}
          <nav className="relative z-10 border-b border-white/5 backdrop-blur-xl bg-[#0a0e17]/60">
            <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
              <Link to="/" className="flex items-center gap-3 group">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:shadow-amber-500/40 transition-shadow">
                  <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <span className="font-display text-xl font-bold text-gradient-amber tracking-tight">
                  Kafka UI
                </span>
              </Link>
              <div className="flex items-center gap-2 text-xs font-mono-data text-slate-500">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                SYSTEM ONLINE
              </div>
            </div>
          </nav>

          {/* Main Content */}
          <main className="relative z-10">
            <Routes>
              <Route path="/" element={<ClusterListPage />} />
              <Route path="/clusters/:clusterId/topics" element={<TopicListPage />} />
              <Route
                path="/clusters/:clusterId/topics/:topicName/messages"
                element={<MessagePage />}
              />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
