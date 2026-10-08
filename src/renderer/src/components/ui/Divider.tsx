import { cn } from '../../lib/cn'

export function Divider({ vertical = false, className }: { vertical?: boolean; className?: string }) {
  return (
    <hr
      aria-orientation={vertical ? 'vertical' : undefined}
      className={cn('shrink-0 border-0 bg-line', vertical ? 'h-full w-px self-stretch' : 'h-px w-full', className)}
    />
  )
}
