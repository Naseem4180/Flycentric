import BrandLogo from './BrandLogo';

// FlyCentric brand mark, pinned to the top of the sidebar and aligned with
// the top bar's height so the two rows line up across the whole shell.
// Routes through the single shared <BrandLogo /> so admin, instructor and
// student sidebars — and every other screen — show the identical mark and
// "FlyCentric" name instead of each persona rolling its own version.
export default function SidebarBrand({ collapsed }) {
  return (
    <div className="admin-sidebar-head">
      <BrandLogo size={28} word={!collapsed} theme="dark" />
    </div>
  );
}
