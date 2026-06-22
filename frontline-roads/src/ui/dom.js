export function queryRequired(selector, root = document) {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

export function setVisible(element, visible) {
  element.hidden = !visible;
}
