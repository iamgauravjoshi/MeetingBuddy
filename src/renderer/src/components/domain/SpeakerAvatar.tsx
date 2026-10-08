import { speakerHue } from '../../lib/speakerColor'
import { Avatar } from '../ui/Avatar'

/** A speaker's initials in their stable colour; the local user (selfName) is always green. */
export function SpeakerAvatar({
  name,
  selfName,
  size = 'sm',
  className
}: {
  name: string
  selfName?: string
  size?: 'xs' | 'sm' | 'md'
  className?: string
}) {
  return <Avatar name={name} hue={speakerHue(name, selfName)} size={size} className={className} />
}
