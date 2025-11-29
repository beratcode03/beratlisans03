// BERAT BİLAL CANKIR
// BERAT CANKIR
// CANKIR
import { useState } from "react";
import { Header } from "@/bilesenler/baslik";
import { TasksSection } from "@/bilesenler/gorevler-bolumu";
import { ProfileModal } from "@/bilesenler/profil-modal";
import { AddTaskModal } from "@/bilesenler/gorev-ekle-modal";

export default function Home() {
  const [addTaskModalOpen, setAddTaskModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background transition-colors duration-300 overflow-x-hidden flex flex-col">
      <Header />
      
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 overflow-x-hidden">
        {/* Görevler Bölümü - Artık kenar çubuğu yok */}
        <TasksSection onAddTask={() => setAddTaskModalOpen(true)} />
      </main>

      {/* Modallar */}
      <AddTaskModal 
        open={addTaskModalOpen} 
        onOpenChange={setAddTaskModalOpen} 
      />
      
      <footer className="bg-muted/30 border-t border-border mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="text-center text-sm text-muted-foreground">
            © 2025-2026 Berat Cankır. Tüm hakları saklıdır.
          </div>
        </div>
      </footer>
    </div>
  );
}

// BERAT BİLAL CANKIR
// BERAT CANKIR
// CANKIR
