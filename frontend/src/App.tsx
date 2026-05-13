import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ClusterListPage from './pages/ClusterListPage';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ClusterListPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
