class LRUNode<K, V> {
  key?: K;
  value?: V;
  prev: LRUNode<K, V> | null = null;
  next: LRUNode<K, V> | null = null;

  constructor(key?: K, value?: V) {
    this.key = key;
    this.value = value;
  }
}

export class LRU<K, V> {
  capacity: number;
  protected head: LRUNode<K, V>;
  protected tail: LRUNode<K, V>;
  cache = new Map<K, LRUNode<K, V>>();

  constructor(capacity: number) {
    this.capacity = capacity;
    this.head = new LRUNode();
    this.tail = new LRUNode();
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  get size() {
    return this.cache.size;
  }

  get(key: K): V | undefined {
    const node = this.cache.get(key);
    if (node) {
      this._moveFront(node);
      return node.value;
    }
  }

  set(key: K, value: V) {
    const exist = this.cache.get(key);
    if (exist) {
      this._remove(exist);
    } else if (this.cache.size >= this.capacity) {
      const lru = this.tail.prev;
      if (lru && lru !== this.head) {
        this._remove(lru);
      }
    }
    this._insert(new LRUNode(key, value));
  }

  delete(key: K) {
    const node = this.cache.get(key);
    if (node) {
      this._remove(node);
    }
  }

  clear() {
    this.cache.clear();
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  protected _remove(node: LRUNode<K, V>) {
    if (node.key !== undefined) {
      this.cache.delete(node.key);
    }
    const prev = node.prev;
    const next = node.next;
    if (prev) {
      prev.next = next;
    }
    if (next) {
      next.prev = prev;
    }
    node.prev = null;
    node.next = null;
  }

  protected _insert(node: LRUNode<K, V>) {
    if (node.key !== undefined) {
      this.cache.set(node.key, node);
    }
    const next = this.head.next;
    node.next = next;
    node.prev = this.head;
    if (next) {
      next.prev = node;
    }
    this.head.next = node;
  }

  protected _moveFront(node: LRUNode<K, V>) {
    if (node === this.head.next) {
      return;
    }
    const prev = node.prev;
    const next = node.next;
    if (prev) {
      prev.next = next;
    }
    if (next) {
      next.prev = prev;
    }
    const headNext = this.head.next;
    node.next = headNext;
    node.prev = this.head;
    if (headNext) {
      headNext.prev = node;
    }
    this.head.next = node;
  }
}
