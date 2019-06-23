module.exports = [{
  provider_id: 1,
  name: 'Namma Metro',
  stations: [
    {label: 'Majestric', index: 0, cost : 0},
    {label: 'Vidhan Soudha', index: 1, cost: .5},
    {label: 'Baiyapanahalli', index: 2, cost: .7},
    {label: 'City Railway', index: 3, cost: .9},
    {label: 'Mysore Road', index: 4, cost: 1.0},
    {label: 'Banashankri', index: 5, cost: 1.2},
    {label: 'K R Puram', index: 6, cost: 1.5},
    {label: 'Mysore', index: 5, cost: 2.0},
  ],
  offers: [
    {trips: 5, discount:5},
    {trips: 10, discount:5},
    {trips: 15, discount:12},
    {trips: 25, discount:15}
  ],
  green_per_trip: 3,
  black_per_trip: 1
}];