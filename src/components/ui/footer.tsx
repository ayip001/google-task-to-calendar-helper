import { Coffee } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t py-4">
      <div className="container mx-auto px-4 flex items-center justify-center gap-6 text-sm text-muted-foreground">
        <iframe
          src="https://ghbtns.com/github-btn.html?user=ayip001&repo=tasks2cal&type=star&count=true"
          frameBorder="0"
          scrolling="0"
          width="100"
          height="20"
          title="GitHub Stars"
        />
        <a
          href="https://buymeacoffee.com/angusflies"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 hover:text-foreground transition-colors"
        >
          <Coffee className="h-4 w-4" />
          <span>Buy me a coffee</span>
        </a>
      </div>
    </footer>
  );
}
