# Sample business notes (for the demo sales dataset)

## Data dictionary
order_date is the day the order was placed. revenue is units x unit_price after discount_pct is applied.
channel is where the order was placed: online (website), store (retail), or partner (resellers).
Regions are North, South, East and West. Product categories are Electronics, Home, Apparel and Grocery.

## Promotions
Apparel ran a clearance promotion from 10 to 20 February 2025 with discounts up to 25 percent. Expect higher Apparel units and lower revenue per unit in that window.

## Incident log
On 10 March 2025 the South region online checkout was migrated to a new payment provider. Orders above 150 dollars now require extra card verification. Support received reports of failed payments on large orders until the provider fixed the verification flow on 31 March 2025.

## Seasonality
Weekends see roughly 25 percent more orders than weekdays across all regions. There is no other known seasonal pattern in the first half of the year.
