// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Mic } from 'lucide-react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MeetingStatusBadge, OpBadge } from '../../src/renderer/src/components/domain'
import {
  Button,
  ConfirmProvider,
  Dialog,
  Field,
  IconButton,
  Input,
  Menu,
  RadioCardGroup,
  Switch,
  Tabs,
  TOAST_MS,
  ToastProvider,
  useConfirm,
  useToast
} from '../../src/renderer/src/components/ui'
import { useHotkey } from '../../src/renderer/src/hooks/useHotkey'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const key = (el: Element, k: string): void => {
  fireEvent.keyDown(el, { key: k })
}

describe('Button', () => {
  it('is disabled and marked busy while loading, and keeps its label', () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>
    )
    const b = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
    expect(b.disabled).toBe(true)
    expect(b.getAttribute('aria-busy')).toBe('true')
    fireEvent.click(b)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('exposes its variant for styling and tests', () => {
    render(<Button variant="danger">Delete</Button>)
    expect(screen.getByRole('button', { name: 'Delete' }).dataset.variant).toBe('danger')
  })

  it('gives an icon-only button its label as accessible name', () => {
    render(<IconButton icon={Mic} label="Mark moment" />)
    expect(screen.getByRole('button', { name: 'Mark moment' })).toBeTruthy()
  })
})

describe('Dialog', () => {
  function Host({ dismissible = true, onClose = vi.fn() }: { dismissible?: boolean; onClose?: () => void }) {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Open
        </button>
        {open && (
          <Dialog
            title="Rename meeting"
            dismissible={dismissible}
            onClose={() => {
              onClose()
              setOpen(false)
            }}
            footer={<Button variant="primary">Save</Button>}
          >
            <Input aria-label="Title" />
          </Dialog>
        )}
      </>
    )
  }

  it('is named by its title and focuses the first field', () => {
    render(<Host />)
    fireEvent.click(screen.getByText('Open'))
    expect(screen.getByRole('dialog', { name: 'Rename meeting' })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText('Title'))
  })

  it('focuses an element marked data-autofocus instead of the first field', () => {
    render(
      <Dialog title="Edit item" onClose={vi.fn()}>
        <Input aria-label="Type" />
        <Input aria-label="Title" data-autofocus />
      </Dialog>
    )
    expect(document.activeElement).toBe(screen.getByLabelText('Title'))
  })

  it('closes on Escape and returns focus to what opened it', () => {
    const onClose = vi.fn()
    render(<Host onClose={onClose} />)
    const opener = screen.getByText('Open')
    opener.focus()
    fireEvent.click(opener)
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('closes on a backdrop click but not a click inside the panel', () => {
    const onClose = vi.fn()
    render(<Host onClose={onClose} />)
    fireEvent.click(screen.getByText('Open'))
    fireEvent.mouseDown(screen.getByLabelText('Title'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores Escape and the backdrop while not dismissible, e.g. while saving', () => {
    const onClose = vi.fn()
    render(<Host dismissible={false} onClose={onClose} />)
    fireEvent.click(screen.getByText('Open'))
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('useConfirm', () => {
  function Asker({ onAnswer, tone }: { onAnswer: (ok: boolean) => void; tone?: 'danger' }) {
    const confirm = useConfirm()
    return (
      <button
        type="button"
        onClick={async () => onAnswer(await confirm({ title: 'Delete project?', confirmLabel: 'Delete project', tone }))}
      >
        Ask
      </button>
    )
  }

  it('resolves true only for the confirm button', async () => {
    const onAnswer = vi.fn()
    render(
      <ConfirmProvider>
        <Asker onAnswer={onAnswer} />
      </ConfirmProvider>
    )
    fireEvent.click(screen.getByText('Ask'))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete project' })))
    expect(onAnswer).toHaveBeenLastCalledWith(true)
    fireEvent.click(screen.getByText('Ask'))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })))
    expect(onAnswer).toHaveBeenLastCalledWith(false)
    fireEvent.click(screen.getByText('Ask'))
    await act(async () => fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true })))
    expect(onAnswer).toHaveBeenLastCalledWith(false)
  })

  it('starts on Cancel for a destructive action', () => {
    render(
      <ConfirmProvider>
        <Asker onAnswer={vi.fn()} tone="danger" />
      </ConfirmProvider>
    )
    fireEvent.click(screen.getByText('Ask'))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
  })
})

describe('Tabs', () => {
  function Host() {
    const [tab, setTab] = useState('state')
    return (
      <Tabs
        label="Project sections"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'state', label: 'State' },
          { value: 'meetings', label: 'Meetings', count: 3 },
          { value: 'history', label: 'History' }
        ]}
      >
        Panel for {tab}
      </Tabs>
    )
  }

  it('moves and selects with arrow keys, Home and End, with one tab stop', () => {
    render(<Host />)
    const state = screen.getByRole('tab', { name: 'State' })
    expect(state.tabIndex).toBe(0)
    expect(screen.getByRole('tab', { name: /Meetings/ }).tabIndex).toBe(-1)
    key(state, 'ArrowRight')
    expect(screen.getByRole('tab', { name: /Meetings/ }).getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /Meetings/ }))
    expect(screen.getByRole('tabpanel', { name: /Meetings/ }).textContent).toBe('Panel for meetings')
    key(document.activeElement!, 'End')
    expect(screen.getByRole('tab', { name: 'History' }).getAttribute('aria-selected')).toBe('true')
    key(document.activeElement!, 'ArrowRight') // wraps around
    expect(screen.getByRole('tab', { name: 'State' }).getAttribute('aria-selected')).toBe('true')
  })
})

describe('RadioCardGroup', () => {
  it('selects with arrow keys and skips disabled options', () => {
    function Host() {
      const [v, setV] = useState('anthropic')
      return (
        <RadioCardGroup
          label="Provider"
          value={v}
          onChange={setV}
          options={[
            { value: 'anthropic', label: 'Anthropic' },
            { value: 'openai', label: 'OpenAI', disabled: true },
            { value: 'ollama', label: 'Ollama' }
          ]}
        />
      )
    }
    render(<Host />)
    key(screen.getByRole('radio', { name: 'Anthropic' }), 'ArrowDown')
    expect(screen.getByRole('radio', { name: 'Ollama' }).getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Ollama' }))
  })
})

describe('Menu', () => {
  const setup = () => {
    const paste = vi.fn()
    const importFile = vi.fn()
    render(
      <Menu
        label="Capture options"
        items={[
          { label: 'Paste transcript', onSelect: paste },
          { label: 'Import transcript file', onSelect: importFile },
          { label: 'Import recording', onSelect: vi.fn(), disabled: true }
        ]}
        trigger={(p) => (
          <button type="button" {...p}>
            More
          </button>
        )}
      />
    )
    return { paste, importFile, trigger: screen.getByRole('button', { name: 'More' }) }
  }

  it('opens on ArrowDown at the first item and moves with the arrow keys and typeahead', () => {
    const { trigger, importFile } = setup()
    key(trigger, 'ArrowDown')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement?.textContent).toBe('Paste transcript')
    key(screen.getByRole('menu'), 'ArrowDown')
    expect(document.activeElement?.textContent).toBe('Import transcript file')
    key(screen.getByRole('menu'), 'ArrowDown') // the disabled item is skipped, so this wraps
    expect(document.activeElement?.textContent).toBe('Paste transcript')
    key(screen.getByRole('menu'), 'i')
    key(document.activeElement!, 'Enter')
    expect(importFile).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('closes on Escape and returns focus to the trigger', () => {
    const { trigger, paste } = setup()
    fireEvent.click(trigger)
    key(screen.getByRole('menu'), 'Escape')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(paste).not.toHaveBeenCalled()
  })
})

describe('toasts', () => {
  function Shower({ tone }: { tone?: 'danger' }) {
    const { show } = useToast()
    return (
      <button type="button" onClick={() => show({ title: `Toast ${tone ?? 'info'}`, tone })}>
        Show {tone ?? 'info'}
      </button>
    )
  }

  it('dismiss themselves after a while, except errors', () => {
    vi.useFakeTimers()
    render(
      <ToastProvider>
        <Shower />
        <Shower tone="danger" />
      </ToastProvider>
    )
    fireEvent.click(screen.getByText('Show info'))
    fireEvent.click(screen.getByText('Show danger'))
    expect(screen.getByRole('status').textContent).toContain('Toast info')
    expect(screen.getByRole('alert').textContent).toContain('Toast danger')
    act(() => vi.advanceTimersByTime(TOAST_MS + 10))
    expect(screen.queryByText('Toast info')).toBeNull()
    expect(screen.getByText('Toast danger')).toBeTruthy()
  })

  it('keep at most three, dropping the oldest', () => {
    render(
      <ToastProvider>
        <Shower tone="danger" />
      </ToastProvider>
    )
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByText('Show danger'))
    expect(screen.getAllByRole('alert')).toHaveLength(3)
  })
})

describe('Field', () => {
  it('labels its control and describes it with the hint and error', () => {
    render(
      <Field label="Base URL" hint="For example http://localhost:1234/v1" error="Must be an http(s) address">
        <Input />
      </Field>
    )
    const input = screen.getByLabelText('Base URL')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const described = input
      .getAttribute('aria-describedby')!
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent)
    expect(described).toEqual(['For example http://localhost:1234/v1', 'Must be an http(s) address'])
  })
})

describe('Switch', () => {
  it('is a labelled switch that toggles', () => {
    const onChange = vi.fn()
    render(<Switch checked={false} onChange={onChange} label="Detect meetings automatically" />)
    const sw = screen.getByRole('switch', { name: 'Detect meetings automatically' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(sw)
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

describe('domain badges', () => {
  it('always show a text label, not just a colour', () => {
    render(
      <>
        <OpBadge op="flag" />
        <MeetingStatusBadge status="analyzed" />
        <MeetingStatusBadge status="recording" />
      </>
    )
    expect(screen.getByText('Conflict')).toBeTruthy()
    expect(screen.getByText('Needs review')).toBeTruthy()
    // the recording dot keeps pulsing under reduced motion (it's a status signal)
    expect(screen.getByText('Recording').querySelector('[data-essential-motion]')).toBeTruthy()
  })
})

describe('useHotkey', () => {
  function Host({ onNext }: { onNext: () => void }) {
    useHotkey('j', onNext)
    return <input aria-label="Notes" />
  }

  it('fires for the key, but not while typing in a field', () => {
    const onNext = vi.fn()
    render(<Host onNext={onNext} />)
    fireEvent.keyDown(window, { key: 'j' })
    expect(onNext).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(screen.getByLabelText('Notes'), { key: 'j' })
    expect(onNext).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true })
    expect(onNext).toHaveBeenCalledTimes(1)
  })
})
