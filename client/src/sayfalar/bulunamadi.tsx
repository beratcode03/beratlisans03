// BERAT BİLAL CANKIR
// BERAT CANKIR
// CANKIR
import { Card, CardContent } from "@/bilesenler/arayuz/card";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">Aradığın Sayfayı mı bulamadın?</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            Sayfayı yönlendiriciye eklemeyi mi unuttum???
          </p>
        </CardContent>
      </Card>
      
      <footer className="bg-muted/30 border-t border-border mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center text-sm text-muted-foreground">
            © 2025-2026 AFYONLUM. Tüm hakları saklıdır.
          </div>
        </div>
      </footer>
    </div>
  );
}

// BERAT BİLAL CANKIR
// BERAT CANKIR
// CANKIR
