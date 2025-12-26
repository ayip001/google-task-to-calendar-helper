import Link from 'next/link';
import Image from 'next/image';
import { Footer } from '@/components/ui/footer';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/tasks2cal-logo.svg"
              alt="Tasks2Cal Logo"
              width={48}
              height={24}
              className="h-6 w-12"
            />
            <h1 className="text-xl font-semibold">Tasks2Cal</h1>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl flex-1">
        <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
        
        <section className="space-y-4 text-muted-foreground">
          <p>Last Updated: December 26, 2025</p>
          
          <h2 className="text-xl font-semibold text-foreground pt-4">1. Acceptance of Terms</h2>
          <p>
            By accessing or using Tasks2Cal, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the application.
          </p>

          <h2 className="text-xl font-semibold text-foreground pt-4">2. Description of Service</h2>
          <p>
            Tasks2Cal is a productivity utility designed to help users synchronize their Google Tasks with their Google Calendar through a drag-and-drop interface and automated scheduling logic.
          </p>

          <h2 className="text-xl font-semibold text-foreground pt-4">3. User Responsibilities</h2>
          <p>
            You are responsible for maintaining the security of your Google account and for all activities that occur under your account while using Tasks2Cal. You agree not to use the service for any illegal or unauthorized purpose.
          </p>

          <h2 className="text-xl font-semibold text-foreground pt-4">4. Limitation of Liability</h2>
          <p>
            Tasks2Cal is provided "as is" and "as available" without any warranties. We shall not be liable for any direct, indirect, incidental, special, or consequential damages resulting from the use or inability to use the service, including but not limited to data loss or errors in scheduling.
          </p>

          <h2 className="text-xl font-semibold text-foreground pt-4">5. Modifications to Service</h2>
          <p>
            We reserve the right to modify or discontinue, temporarily or permanently, the service with or without notice at any time.
          </p>

          <h2 className="text-xl font-semibold text-foreground pt-4">6. Contact Information</h2>
          <p>
            For any questions regarding these Terms, please contact us at:
          </p>
          <div className="mt-2">
            <img 
              src="/contact-email.png" 
              alt="Contact Email"
              className="h-6 w-auto"
            />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

