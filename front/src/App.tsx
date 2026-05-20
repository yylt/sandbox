import { useState } from 'react';
import { AppProvider, useAppStore } from './store/AppContext';
import { ProjectRail } from './components/ProjectRail';
import { SessionSidebar } from './components/SessionSidebar';
import { ChatArea } from './components/ChatArea';
import { ToolPanel } from './components/ToolPanel';

function Layout() {
  const { theme } = useAppStore();
  const [terminalOpen, setTerminalOpen] = useState(false);

  return (
    <div className={theme === 'dark' ? 'dark' : ''} style={{ height: '100vh', overflow: 'hidden' }}>
      <div className="flex h-screen bg-white dark:bg-[#0f1117] text-gray-900 dark:text-gray-100">
        <ProjectRail />
        <SessionSidebar />
        <ChatArea terminalOpen={terminalOpen} onTerminalToggle={() => setTerminalOpen(v => !v)} onTerminalClose={() => setTerminalOpen(false)} />
        <ToolPanel onTerminalToggle={() => setTerminalOpen(v => !v)} terminalOpen={terminalOpen} />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Layout />
    </AppProvider>
  );
}

