// Slot - Named regions for dynamic content injection
//
// Slots allow layouts to define named regions where widgets can be mounted.
// The compositor places widgets into slots based on context.
// This is a runtime-only concept - not a React component.

/**
 * Slot registry for runtime mounting
 */
const slotRegistry = new Map<string, HTMLElement>();

/**
 * Register a slot element
 */
export function registerSlot(name: string, element: HTMLElement): void {
  slotRegistry.set(name, element);
}

/**
 * Unregister a slot element
 */
export function unregisterSlot(name: string): void {
  slotRegistry.delete(name);
}

/**
 * Get slot element by name
 */
export function getSlotElement(name: string): HTMLElement | null {
  return slotRegistry.get(name) ?? null;
}

/**
 * Get all registered slot names
 */
export function getSlotNames(): string[] {
  return Array.from(slotRegistry.keys());
}

/**
 * Clear all registered slots
 */
export function clearSlots(): void {
  slotRegistry.clear();
}

/**
 * Mount content into a slot
 */
export function mountToSlot(
  name: string,
  content: HTMLElement | string,
): () => void {
  const element = getSlotElement(name);
  if (!element) {
    console.warn(`Slot "${name}" not found`);
    return () => {};
  }

  // Store previous content for cleanup
  const previousContent = element.innerHTML;

  // Mount new content
  if (typeof content === 'string') {
    element.innerHTML = content;
  } else {
    element.innerHTML = '';
    element.appendChild(content);
  }

  // Return cleanup function
  return () => {
    element.innerHTML = previousContent;
  };
}

/**
 * Generate slot HTML attribute markup
 */
export function slotAttribute(name: string): string {
  return `data-slot="${name}"`;
}

/**
 * Find all slots in a DOM tree and register them
 */
export function discoverSlots(root: HTMLElement | Document = document): void {
  const slots = root.querySelectorAll('[data-slot]');
  slots.forEach((el) => {
    const name = el.getAttribute('data-slot');
    if (name) {
      registerSlot(name, el as HTMLElement);
    }
  });
}
