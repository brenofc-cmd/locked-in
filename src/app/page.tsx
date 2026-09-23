// Temporary Stage 1 screen. Replaced by the real Today screen in Stage 2.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col justify-center gap-4 px-6">
      <h1 className="font-mono text-sm font-semibold tracking-[0.24em]">
        LOCKED IN
      </h1>
      <p className="text-2xl font-semibold tracking-tight">Foundation ready.</p>
      <p className="font-mono text-xs tracking-[0.2em] text-accent">
        STAGE 1 / 10
      </p>
    </main>
  );
}
