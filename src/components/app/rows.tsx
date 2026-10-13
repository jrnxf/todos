// A card of rows with a hairline between each: the shape every list in the
// app takes. Thin wrappers over shadcn's Item so the spacing is set once.
import { Children, Fragment, isValidElement } from 'react'
import { cn } from 'cn'
import { Item, ItemGroup, ItemSeparator } from '@/components/ui/item'

export function Rows({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ItemGroup>) {
  const rows = Children.toArray(children).filter(isValidElement)
  return (
    <ItemGroup
      // ItemGroup widens its gap when anything inside is small, such as an
      // avatar; rows here always sit flush with a separator between them.
      className={cn(
        'gap-0 overflow-hidden rounded-xl border bg-card has-data-[size=sm]:gap-0 has-data-[size=xs]:gap-0',
        className,
      )}
      {...props}
    >
      {rows.map((row, index) => (
        <Fragment key={row.key}>
          {index > 0 && <ItemSeparator className="my-0" />}
          {row}
        </Fragment>
      ))}
    </ItemGroup>
  )
}

export function Row({
  className,
  ...props
}: React.ComponentProps<typeof Item>) {
  return (
    <Item
      role="listitem"
      className={cn('rounded-none border-0 px-4 py-3.5', className)}
      {...props}
    />
  )
}
