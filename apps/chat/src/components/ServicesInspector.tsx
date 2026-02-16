import { useState } from 'react';
import { ChevronDown, Server } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogClose,
} from '@/components/ui/dialog';

export interface ServiceInfo {
  name: string;
  namespace: string;
  procedure: string;
  description: string;
  parameters: {
    jsonSchema: Record<string, unknown>;
  };
}

interface ServicesInspectorProps {
  namespaces: string[];
  services?: ServiceInfo[];
}

export function ServicesInspector({ namespaces, services = [] }: ServicesInspectorProps) {
  const [open, setOpen] = useState(false);

  if (namespaces.length === 0) return null;

  const groupedServices = services.reduce<Record<string, ServiceInfo[]>>((acc, svc) => {
    (acc[svc.namespace] ??= []).push(svc);
    return acc;
  }, {});

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <Server className="h-4 w-4 text-muted-foreground" />
        <Badge variant="secondary" className="text-xs">
          {namespaces.length} service{namespaces.length !== 1 ? 's' : ''}
        </Badge>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogHeader>
          <DialogClose onClose={() => setOpen(false)} />
        </DialogHeader>
        <DialogContent>
          <div className="space-y-3">
            {namespaces.map((ns) => (
              <Collapsible key={ns} defaultOpen={namespaces.length === 1}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded bg-muted/50 hover:bg-muted transition-colors">
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
                  <span className="font-medium text-sm">{ns}</span>
                  {groupedServices[ns] && (
                    <Badge variant="outline" className="ml-auto text-xs">
                      {groupedServices[ns].length} tool{groupedServices[ns].length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="ml-6 mt-2 space-y-2">
                    {groupedServices[ns]?.map((svc) => (
                      <Collapsible key={svc.name}>
                        <CollapsibleTrigger className="flex items-center gap-2 w-full text-left text-sm hover:text-foreground text-muted-foreground transition-colors">
                          <ChevronDown className="h-3 w-3 transition-transform [[data-state=open]>&]:rotate-180" />
                          <code className="font-mono text-xs">{svc.procedure}</code>
                          <span className="truncate text-xs opacity-70">{svc.description}</span>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="ml-5 mt-1 p-2 rounded border bg-muted/30 overflow-auto max-h-48">
                            <pre className="text-xs font-mono whitespace-pre-wrap break-words m-0">
                              {JSON.stringify(svc.parameters.jsonSchema, null, 2)}
                            </pre>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )) ?? (
                      <p className="text-xs text-muted-foreground">No tool details available</p>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
