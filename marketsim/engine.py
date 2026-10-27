"""Integer-tick, integer-lot FIFO matching. No brokerage integration."""

from collections import OrderedDict
from dataclasses import dataclass, asdict
import heapq


@dataclass
class Order:
    order_id: str
    side: str
    quantity: int
    remaining: int
    price: int | None
    sequence: int
    state: str = "NEW"


class Book:
    """Price maps + heaps + ordered dictionaries. Cancellation removes an ID
    in O(1); empty-price heap cleanup is lazy and amortized O(log P).
    One engine instance represents one instrument; prices are integer cents.
    Terminal order identities are retained to prevent ID reuse.
    """

    def __init__(self):
        self.levels = {"BUY": {}, "SELL": {}}
        self.heaps = {"BUY": [], "SELL": []}
        self.orders = {}
        self.sequence = 0
        self.trades = []

    def best(self, side):
        heap = self.heaps[side]
        sign = -1 if side == "BUY" else 1
        while heap and sign * heap[0] not in self.levels[side]:
            heapq.heappop(heap)
        return sign * heap[0] if heap else None

    def submit(self, order_id, side, quantity, price=None):
        if (
            not isinstance(order_id, str)
            or not order_id
            or len(order_id) > 64
            or order_id in self.orders
        ):
            raise ValueError("Order ID must be unique and 1–64 characters")
        if (
            side not in ("BUY", "SELL")
            or type(quantity) is not int
            or not 0 < quantity <= 10000000
        ):
            raise ValueError("Invalid side or integer quantity")
        if price is not None and (type(price) is not int or not 0 < price <= 100000000):
            raise ValueError("Price must be positive integer ticks")
        self.sequence += 1
        order = Order(order_id, side, quantity, quantity, price, self.sequence)
        self.orders[order_id] = order
        other = "SELL" if side == "BUY" else "BUY"
        fills = []
        while order.remaining:
            best = self.best(other)
            if best is None or (
                price is not None
                and (
                    (side == "BUY" and best > price)
                    or (side == "SELL" and best < price)
                )
            ):
                break
            queue = self.levels[other][best]
            maker = next(iter(queue.values()))
            qty = min(order.remaining, maker.remaining)
            maker.remaining -= qty
            order.remaining -= qty
            maker.state = "FILLED" if maker.remaining == 0 else "PARTIALLY_FILLED"
            fill = {
                "trade_id": len(self.trades) + 1,
                "sequence": self.sequence,
                "maker": maker.order_id,
                "taker": order_id,
                "side": side,
                "price": best,
                "quantity": qty,
            }
            self.trades.append(fill)
            fills.append(fill)
            if maker.remaining == 0:
                del queue[maker.order_id]
            if not queue:
                del self.levels[other][best]
        if not order.remaining:
            order.state = "FILLED"
        elif price is None:
            order.state = "CANCELLED"  # IOC remainder; fills remain recorded
        else:
            order.state = "PARTIALLY_FILLED" if order.remaining < quantity else "NEW"
            if price not in self.levels[side]:
                self.levels[side][price] = OrderedDict()
                heapq.heappush(self.heaps[side], price * (-1 if side == "BUY" else 1))
            self.levels[side][price][order_id] = order
        return {"order": asdict(order), "fills": fills}

    def cancel(self, order_id):
        order = self.orders.get(order_id)
        if (
            order is None
            or order.state not in ("NEW", "PARTIALLY_FILLED")
            or order.price is None
        ):
            raise ValueError("Order is not resting")
        queue = self.levels[order.side][order.price]
        del queue[order_id]
        if not queue:
            del self.levels[order.side][order.price]
        order.state = "CANCELLED"
        self.sequence += 1
        return asdict(order)

    def snapshot(self, depth=10):
        out = {"sequence": self.sequence}
        for side, label in [("BUY", "bids"), ("SELL", "asks")]:
            prices = sorted(self.levels[side], reverse=side == "BUY")[:depth]
            out[label] = [
                {
                    "price": p,
                    "quantity": sum(o.remaining for o in self.levels[side][p].values()),
                    "orders": len(self.levels[side][p]),
                }
                for p in prices
            ]
        b, a = self.best("BUY"), self.best("SELL")
        out.update(
            mid=(a + b) / 2 if a is not None and b is not None else None,
            spread=a - b if a is not None and b is not None else None,
        )
        bid = sum(r["quantity"] for r in out["bids"])
        ask = sum(r["quantity"] for r in out["asks"])
        out["imbalance"] = (bid - ask) / (bid + ask) if bid + ask else None
        out["microprice"] = None
        if a is not None and b is not None:
            bq = out["bids"][0]["quantity"]
            aq = out["asks"][0]["quantity"]
            out["microprice"] = (a * bq + b * aq) / (bq + aq)
        return out

    def assert_invariants(self):
        b, a = self.best("BUY"), self.best("SELL")
        assert b is None or a is None or b < a
        for side, levels in self.levels.items():
            for price, queue in levels.items():
                assert queue
                seq = []
                for o in queue.values():
                    assert (
                        o.side == side
                        and o.price == price
                        and 0 < o.remaining <= o.quantity
                    )
                    assert o.state in ("NEW", "PARTIALLY_FILLED")
                    seq.append(o.sequence)
                assert seq == sorted(seq)
        for o in self.orders.values():
            filled = sum(
                t["quantity"]
                for t in self.trades
                if o.order_id in (t["maker"], t["taker"])
            )
            assert filled + o.remaining == o.quantity


def apply(book, event):
    if not isinstance(event, dict) or event.get("type") not in (
        "CANCEL",
        "LIMIT",
        "MARKET",
    ):
        raise ValueError("Unsupported instruction type")
    if event["type"] == "LIMIT" and event.get("price") is None:
        raise ValueError("Limit price required")
    if event["type"] == "MARKET" and event.get("price") is not None:
        raise ValueError("Market price must be null")
    if event["type"] == "CANCEL":
        return {"cancel": book.cancel(event["order_id"]), "fills": []}
    return book.submit(
        event["order_id"], event["side"], event["quantity"], event.get("price")
    )
