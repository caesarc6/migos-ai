export function RightsNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-sm leading-relaxed text-muted-foreground ${className}`}>
      Only upload characters and likenesses you have the rights to use. MIGO is a general creative
      tool for your own performance template.
    </p>
  );
}
