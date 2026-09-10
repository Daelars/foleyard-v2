import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

// Volume and zoom. Same well-and-key construction as the switch, stretched:
// the track is inset material with an inward shadow, the filled portion is
// the accent gradient, and the thumb is a raised control disc — not, as
// before, an accent dot on an accent bar, where the handle disappeared into
// the fill it was supposed to be positioned against.
//
// The 3px track reads at a glance without becoming a bar; the 14px thumb
// matches the switch thumb, so the two controls look related in a settings
// column. The thumb keeps a -8px hit area so a 14px target is still easy.

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: SliderPrimitive.Root.Props) {
  const _values = Array.isArray(value)
    ? value
    : Array.isArray(defaultValue)
      ? defaultValue
      : [min, max]

  return (
    <SliderPrimitive.Root
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-[var(--state-disabled-opacity)] data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className={cn(
            "relative grow overflow-hidden rounded-full select-none",
            "border border-edge bg-mat-inset shadow-elev-well",
            "data-horizontal:h-[3px] data-horizontal:w-full data-vertical:h-full data-vertical:w-[3px]"
          )}
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="select-none bg-[image:var(--mat-accent-hover)] data-horizontal:h-full data-vertical:w-full"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className={cn(
              "relative block size-3.5 shrink-0 rounded-full select-none",
              "border border-edge-hover bg-[image:var(--mat-control-hover)] shadow-elev-lift",
              "transition-[box-shadow,border-color] after:absolute after:-inset-2",
              "hover:border-edge-accent",
              "focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:outline-hidden",
              "active:shadow-elev-sink",
              "disabled:pointer-events-none"
            )}
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
