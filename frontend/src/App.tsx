import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ClusterListPage from './pages/ClusterListPage';
import TopicListPage from './pages/TopicListPage';
import MessagePage from './pages/MessagePage';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ClusterListPage />} />
          <Route path="/clusters/:clusterId/topics" element={<TopicListPage />} />
          <Route
            path="/clusters/:clusterId/topics/:topicName/messages"
            element={<MessagePage />}
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
