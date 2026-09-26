export default function CreateLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6" role="status">
      <div className="h-3 w-16 rounded bg-muted" />
      <div className="mt-4 h-10 w-72 max-w-full rounded bg-muted" />
      <p className="mt-6 text-sm text-muted-foreground">Opening the studio…</p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="h-80 rounded-xl bg-card ring-1 ring-border" />
        <div className="h-80 rounded-xl bg-card ring-1 ring-border" />
      </div>
    </main>
  );
}
