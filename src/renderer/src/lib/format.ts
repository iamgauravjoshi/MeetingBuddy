export { fmtTime } from '@shared/format'

export const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** The full date and time, for tooltips next to a short date. */
export const fmtDateLong = (iso: string): string => new Date(iso).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })

/** An Electron accelerator as people read it: CommandOrControl+Shift+M → Ctrl+Shift+M. */
export const fmtAccelerator = (acc: string): string => acc.replace(/CommandOrControl|CmdOrCtrl/g, 'Ctrl')
