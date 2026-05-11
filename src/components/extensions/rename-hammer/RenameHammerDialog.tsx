"use client"

import { useState, useCallback, useMemo } from "react"
import { Hash, ArrowUpDown, Loader2, CaseSensitive } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { ExtensionDialogShell } from "@/components/extensions/ExtensionDialogShell"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"

interface RenameRow {
  original: string
  renamed: string
  hasConflict: boolean
}

const TOKENS = ["{name}", "{index}", "{ext}", "{format}", "{date}", "{time}"]

function applyPattern(
  filename: string,
  pattern: string,
  style: "snake_case" | "kebab-case" | "title-case",
  index: number
): string {
  const parsed = filename.match(/(.+)\.([^.]+$)/)
  const name = parsed?.[1] ?? filename
  const ext = parsed?.[2] ?? ""

  let result = pattern
    .replace(/{name}/g, name)
    .replace(/{index}/g, String(index).padStart(3, "0"))
    .replace(/{ext}/g, ext)
    .replace(/{format}/g, ext)
    .replace(/{date}/g, new Date().toISOString().slice(0, 10))
    .replace(/{time}/g, Date.now().toString())

  if (style === "snake_case") {
    result = result
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_.-]/g, "_")
  } else if (style === "kebab-case") {
    result = result
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9_.-]/g, "-")
  } else if (style === "title-case") {
    result = result
      .replace(/[_-]/g, " ")
      .replace(/\w\S*/g, (w) =>
        w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
      )
  }

  if (!result.includes(".") && ext) {
    result += "." + ext
  }

  return result
}

interface RenameHammerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const MOCK_FILES = [
  "AUDIO_2398.wav",
  "client_feedback_02.wav",
  "SFX_boom_001.wav",
  "export-take-43.wav",
  "Untitled recording 15.wav",
  "weird name  !@# .wav",
  "final_mix_v3 (1).wav",
  "project_audio_2024_03_14.wav",
]

export function RenameHammerDialog({
  open,
  onOpenChange,
}: RenameHammerDialogProps) {
  const [target, setTarget] = useState<
    "selection" | "folder" | "search"
  >("folder")
  const [style, setStyle] = useState<
    "snake_case" | "kebab-case" | "title-case"
  >("snake_case")
  const [pattern, setPattern] = useState(
    "{name}"
  )
  const [lowercase, setLowercase] = useState(true)
  const [replaceSpaces, setReplaceSpaces] = useState(true)
  const [numberSuffix, setNumberSuffix] = useState(false)
  const [isApplying, setIsApplying] = useState(false)

  const rows: RenameRow[] = useMemo(() => {
    return MOCK_FILES.map((file, idx) => {
      const renamed = applyPattern(file, pattern, style, idx + 1)
      return {
        original: file,
        renamed,
        hasConflict:
          renamed !== file &&
          MOCK_FILES.some(
            (other, otherIdx) =>
              otherIdx !== idx && other === renamed
          ),
      }
    })
  }, [pattern, style])

  const conflictCount = rows.filter(
    (r) => r.hasConflict
  ).length
  const changedCount = rows.filter(
    (r) => r.renamed !== r.original
  ).length
  const canApply = changedCount > 0 && conflictCount === 0

  const handleApply = useCallback(async () => {
    setIsApplying(true)
    await new Promise((r) => setTimeout(r, 1000))
    toast.success("Rename backend is not yet implemented")
    setIsApplying(false)
  }, [])

  const footer = (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button disabled={!canApply} />}
      >
        <ArrowUpDown className="mr-2 size-4" />
        Apply rename
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Rename {changedCount} file
            {changedCount !== 1 ? "s" : ""}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will rename files on disk. You can undo the last rename
            after applying.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleApply}
            disabled={isApplying}
          >
            {isApplying ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            Rename files
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return (
    <ExtensionDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Rename Hammer"
      description="Batch rename ugly sound filenames into clean searchable names."
      icon={<CaseSensitive className="size-4" />}
      maxWidth="xl"
      footer={footer}
    >
          <section className="space-y-4 rounded-xl border border-border/40 bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <CaseSensitive className="size-4 text-primary" />
              <span className="text-sm font-medium">Rename configuration</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Rename target</Label>
                <Select
                  value={target}
                  onValueChange={(v: unknown) =>
                    setTarget(
                      v as "selection" | "folder" | "search"
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="selection">
                      Selected files
                    </SelectItem>
                    <SelectItem value="folder">
                      Current folder
                    </SelectItem>
                    <SelectItem value="search">
                      Current search results
                    </SelectItem>
                  </SelectPopup>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Filename style</Label>
                <Select
                  value={style}
                  onValueChange={(v: unknown) =>
                    setStyle(
                      v as "snake_case" | "kebab-case" | "title-case"
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="snake_case">
                      snake_case
                    </SelectItem>
                    <SelectItem value="kebab-case">
                      kebab-case
                    </SelectItem>
                    <SelectItem value="title-case">
                      Title Case
                    </SelectItem>
                  </SelectPopup>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Pattern</Label>
              <Input
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder="{name}_{index}"
              />
              <div className="flex flex-wrap gap-1.5">
                {TOKENS.map((token) => (
                  <Button
                    key={token}
                    size="sm"
                    variant="secondary"
                    type="button"
                    className="text-xs"
                    onClick={() =>
                      setPattern((prev) => prev + token)
                    }
                  >
                    <Hash className="mr-1 size-2.5" />
                    {token}
                  </Button>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-border/40 bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <Hash className="size-4 text-primary" />
              <span className="text-sm font-medium">Options</span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Label
                htmlFor="rh-lowercase"
                className="text-sm font-normal"
              >
                Lowercase
              </Label>
              <Switch
                id="rh-lowercase"
                checked={lowercase}
                onCheckedChange={setLowercase}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <Label
                htmlFor="rh-spaces"
                className="text-sm font-normal"
              >
                Replace spaces
              </Label>
              <Switch
                id="rh-spaces"
                checked={replaceSpaces}
                onCheckedChange={setReplaceSpaces}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <Label
                htmlFor="rh-number"
                className="text-sm font-normal"
              >
                Add number suffix
              </Label>
              <Switch
                id="rh-number"
                checked={numberSuffix}
                onCheckedChange={setNumberSuffix}
              />
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-border/40 bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="size-4 text-primary" />
                <span className="text-sm font-medium">Live preview</span>
              </div>
              {changedCount > 0 && (
                <Badge variant="secondary">
                  {changedCount} to rename
                </Badge>
              )}
            </div>

            <div className="max-h-48 overflow-y-auto rounded-lg border border-border/40">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Before</TableHead>
                    <TableHead>After</TableHead>
                    <TableHead className="w-20 text-right">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                        No files found for this target.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs font-mono max-w-[160px] truncate">
                          {row.original}
                        </TableCell>
                        <TableCell className="text-xs font-mono max-w-[160px] truncate">
                          {row.renamed !== row.original ? (
                            <span className="text-foreground">
                              {row.renamed}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              {row.renamed}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.hasConflict ? (
                            <Badge variant="destructive">
                              Conflict
                            </Badge>
                          ) : row.renamed !== row.original ? (
                            <Badge variant="secondary">Safe</Badge>
                          ) : (
                            <Badge variant="outline">
                              Unchanged
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          {conflictCount > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                {conflictCount} name conflict
                {conflictCount !== 1 ? "s" : ""} detected. Resolve before
                applying.
              </AlertDescription>
            </Alert>
          )}

          {changedCount > 0 && conflictCount === 0 && (
            <Alert>
              <AlertDescription>
                {changedCount} file{changedCount !== 1 ? "s" : ""} will be
                renamed. Undo will be available.
              </AlertDescription>
            </Alert>
          )}
    </ExtensionDialogShell>
  )
}
