class LRUNode<V> {
  value?: V;
  prev?: LRUNode<V>;
  next?: LRUNode<V>;
  constructor(value?: V) {
    this.value = value;
  }
}

export class LRU<K, V> {
  capacity: number;
  protected head: LRUNode<V>;
  protected tail: LRUNode<V>;
  cache = new Map<K, LRUNode<V>>();

  constructor(capacity: number) {
    this.capacity = capacity;
    this.head = new LRUNode();
    this.tail = new LRUNode();
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  get(key: K): V | undefined {
    const node = this.cache.get(key);
    if (node) {
      this._moveFront(node);
      return node.value;
    }
    return;
  }

  set(key: K, value: V) {
    const exist = this.cache.get(key);
    if (exist) {
      this._remove(key, exist);
    } else if (this.cache.size >= this.capacity) {
      this._remove(key, this.tail.prev);
    }
    this._insert(key, new LRUNode(value));
  }

  protected _remove(key: K, node: LRUNode<V>) {
    this.cache.delete(key);
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }

  protected _insert(key: K, node: LRUNode<V>) {
    this.cache.set(key, node);
    node.next = this.head.next;
    node.prev = this.head;
    this.head.next.prev = node;
    this.head.next = node;
  }

  protected _moveFront(node: LRUNode<V>) {
    if (node === this.head.next) {
      return;
    }
    node.prev.next = node.next;
    node.next.prev = node.prev;
    node.next = this.head.next;
    node.prev = this.head;
    this.head.next.prev = node;
    this.head.next = node;
  }
}
