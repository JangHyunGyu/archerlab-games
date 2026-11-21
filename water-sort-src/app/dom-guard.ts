const GUARD_STATE = Symbol('waterSortDomGuard');

type GuardState = {
  rootEl: Element | null;
  originalRemoveChild: typeof Node.prototype.removeChild;
  originalInsertBefore: typeof Node.prototype.insertBefore;
};

type GuardedNodeProto = Node & {
  [GUARD_STATE]?: GuardState;
};

function isNodeLike(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && 'nodeType' in value;
}

function isManagedContainer(node: Node, rootEl: Element | null): boolean {
  if (rootEl && (node === rootEl || rootEl.contains(node))) return true;
  return node === node.ownerDocument?.body;
}

/**
 * Guards React-owned DOM containers (the app root and document.body portals)
 * against external mutations from Safari features or browser extensions that
 * wrap or detach nodes before React reconciles them.
 */
export function installDomMutationGuard(
  rootEl: Element | null = null,
  win: typeof window | undefined = typeof window !== 'undefined' ? window : undefined,
): () => void {
  const NodeCtor = win?.Node;
  if (!NodeCtor?.prototype) return () => {};

  const proto = NodeCtor.prototype as GuardedNodeProto;
  const existing = proto[GUARD_STATE];
  if (existing) {
    existing.rootEl = rootEl;
    return () => restoreDomMutationGuard(proto);
  }

  const originalRemoveChild = proto.removeChild;
  const originalInsertBefore = proto.insertBefore;
  const state: GuardState = {
    rootEl,
    originalRemoveChild,
    originalInsertBefore,
  };
  proto[GUARD_STATE] = state;

  proto.removeChild = function removeChild<T extends Node>(this: Node, child: T): T {
    if (!isNodeLike(child) || child.parentNode === this || !isManagedContainer(this, state.rootEl)) {
      return originalRemoveChild.call(this, child) as T;
    }

    // Remove from an extension-injected wrapper still inside this container so stale UI does not linger.
    if (child !== this && child.parentNode && this.contains(child)) {
      return originalRemoveChild.call(child.parentNode, child) as T;
    }

    // Already detached or moved outside this managed container; let React continue without crashing.
    return child;
  };

  proto.insertBefore = function insertBefore<T extends Node>(
    this: Node,
    newNode: T,
    referenceNode: Node | null,
  ): T {
    if (
      referenceNode == null ||
      !isNodeLike(referenceNode) ||
      referenceNode.parentNode === this ||
      !isManagedContainer(this, state.rootEl)
    ) {
      return originalInsertBefore.call(this, newNode, referenceNode) as T;
    }

    // If an extension wrapped the reference sibling, insert before the wrapper child of `this`.
    let anchor: Node | null = referenceNode;
    while (anchor && anchor.parentNode !== this) {
      anchor = anchor.parentNode;
    }
    return originalInsertBefore.call(this, newNode, anchor) as T;
  };

  return () => restoreDomMutationGuard(proto);
}

function restoreDomMutationGuard(proto: GuardedNodeProto) {
  const state = proto[GUARD_STATE];
  if (!state) return;
  proto.removeChild = state.originalRemoveChild;
  proto.insertBefore = state.originalInsertBefore;
  delete proto[GUARD_STATE];
}
