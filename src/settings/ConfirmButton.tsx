import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface ConfirmButtonProps {
  label: string
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  disabled?: boolean
  destructive?: boolean
}

/** Button that asks for confirmation in a small dialog before acting. */
export function ConfirmButton({
  label,
  title,
  description,
  confirmLabel,
  onConfirm,
  disabled,
  destructive,
}: ConfirmButtonProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant={destructive ? 'destructive' : 'outline'}
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{description}</p>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={destructive ? 'destructive' : 'default'}
              size="sm"
              onClick={() => {
                onConfirm()
                setOpen(false)
              }}
              // Same solid style as AppHeader's "Clean" confirm.
              className={destructive ? 'bg-destructive text-white hover:bg-destructive/90' : undefined}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
