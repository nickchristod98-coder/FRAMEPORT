function Error({ statusCode }: { statusCode?: number }) {
  return (
    <main className="grid min-h-screen place-items-center bg-black text-white">
      <div className="text-center">
        <p className="text-[11px] uppercase tracking-[0.35em] text-white/45">FramePort</p>
        <h1 className="mt-3 font-display text-5xl">{statusCode || 500}</h1>
        <p className="mt-3 text-white/60">Something went wrong.</p>
        <a href="/" className="mt-8 inline-block text-sm uppercase tracking-[0.2em] text-white underline">
          Back home
        </a>
      </div>
    </main>
  );
}

Error.getInitialProps = ({ res, err }: { res?: { statusCode?: number }; err?: { statusCode?: number } }) => {
  const statusCode = res?.statusCode ?? err?.statusCode ?? 404;
  return { statusCode };
};

export default Error;
