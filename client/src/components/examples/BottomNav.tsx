import { useState } from 'react';
import BottomNav from '../BottomNav';

export default function BottomNavExample() {
  const [activeTab, setActiveTab] = useState('home');
  
  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center bg-muted">
        <p className="text-muted-foreground">Active tab: {activeTab}</p>
      </div>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
