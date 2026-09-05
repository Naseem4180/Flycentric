const CART_KEY = 'fc_cart_bundles';

export function readCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    if (Array.isArray(parsed)) return parsed;
    const legacy = JSON.parse(localStorage.getItem('fc_cart_bundle') || 'null');
    return legacy ? [legacy] : [];
  } catch {
    return [];
  }
}

export function writeCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  localStorage.removeItem('fc_cart_bundle');
  window.dispatchEvent(new Event('cartchange'));
}

export function addToCart(bundle) {
  const items = readCart();
  if (!items.some((item) => String(item.id) === String(bundle.id))) writeCart([...items, bundle]);
  return items.some((item) => String(item.id) === String(bundle.id)) ? items : [...items, bundle];
}

export function removeFromCart(id) {
  writeCart(readCart().filter((item) => String(item.id) !== String(id)));
}

export { CART_KEY };
