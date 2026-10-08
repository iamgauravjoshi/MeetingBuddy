import { fmtAccelerator } from '../../lib/format'
import { cn } from '../../lib/cn'

/** A keyboard shortcut chip. Electron accelerators are shown as people read them (CommandOrControl → Ctrl). */
export function Kbd({ children, className }: { children: string; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 items-center rounded-xs border border-line bg-inset px-1.5 font-mono text-fg-secondary text-mono',
        className
      )}
    >
      {fmtAccelerator(children)}
    </kbd>
  )
}
