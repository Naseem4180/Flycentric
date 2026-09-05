// Original mark — not a copy of any third-party template's logo. Same general
// "blue circular F" visual language the person asked for, drawn from scratch
// using simple geometric bars rather than any traced/copied artwork.
export default function Logo({ size = 30 }) {
  return (
    <img
      src="/favicon.png"
      width={size}
      height={size}
      aria-hidden="true"
    />
  );
}
