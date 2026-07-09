export const en = {
	app: {
		title: 'Serpens'
	},
	topBar: {
		day: 'Day {day}',
		cash: 'Cash',
		alerts: 'Alerts',
		noAlerts: 'No alerts'
	},
	gameMenu: {
		menu: 'Menu',
		mapView: 'Map view',
		language: 'Language',
		saves: 'Saves',
		views: {
			retail: 'Retail',
			industry: 'Industry',
			world: 'World'
		}
	},
	controlDesk: {
		build: 'Build',
		management: 'Management',
		shortcuts: 'Shortcuts',
		advanceDay: 'Advance day'
	},
	game: {
		archetypes: {
			convenience: {
				name: 'Convenience Store',
				description: 'Fast turnover, steady foot traffic, low margins, and stockout sensitivity.',
				risks: {
					0: 'Stockouts',
					1: 'Low margins',
					2: 'High foot traffic pressure'
				}
			},
			boutique: {
				name: 'Boutique Goods',
				description:
					'Curated products, customer taste, reputation sensitivity, and premium upside.',
				risks: {
					0: 'Trend mismatch',
					1: 'Reputation swings',
					2: 'Premium service expectations'
				}
			},
			electronics: {
				name: 'Electronics & Games',
				description: 'Higher-ticket sales, trend spikes, launches, and shrink risk.',
				risks: {
					0: 'Launch volatility',
					1: 'Shrink',
					2: 'Expensive inventory'
				}
			},
			grocery: {
				name: 'Grocery Market',
				description:
					'Recurring demand, freshness pressure, broad categories, and supply complexity.',
				risks: {
					0: 'Freshness',
					1: 'Waste',
					2: 'Staffing pressure'
				}
			}
		},
		products: {
			'bottled-water': 'Bottled Water',
			snacks: 'Snacks',
			drinks: 'Drinks',
			essentials: 'Essentials',
			household: 'Household',
			apparel: 'Apparel',
			'home-goods': 'Home Goods',
			gifts: 'Gifts',
			'fashion-accessories': 'Fashion Accessories',
			games: 'Games',
			accessories: 'Accessories',
			devices: 'Devices',
			peripherals: 'Peripherals',
			produce: 'Produce',
			pantry: 'Pantry',
			prepared: 'Prepared Food',
			bakery: 'Bakery'
		},
		materials: {
			grain: 'Grain',
			salt: 'Salt',
			oilseeds: 'Oilseeds',
			water: 'Water',
			fruit: 'Fruit',
			sugar: 'Sugar',
			pulpwood: 'Pulpwood',
			'chemical-feedstock': 'Chemical Feedstock',
			flour: 'Flour',
			'cooking-oil': 'Cooking Oil',
			'filtered-water': 'Filtered Water',
			syrup: 'Syrup',
			'paper-pulp': 'Paper Pulp',
			plastic: 'Plastic',
			packaging: 'Packaging',
			'cleaning-base': 'Cleaning Base',
			snacks: 'Snacks',
			drinks: 'Drinks',
			essentials: 'Essentials',
			gifts: 'Gifts',
			'bottled-water': 'Bottled Water',
			produce: 'Produce',
			pantry: 'Pantry Goods'
		},
		industrialBuildings: {
			'grain-farm': 'Grain Farm',
			'salt-mine': 'Salt Mine',
			'oilseed-farm': 'Oilseed Farm',
			'water-pump': 'Water Pump',
			'fruit-farm': 'Fruit Farm',
			'sugar-farm': 'Sugar Farm',
			'pulpwood-grove': 'Pulpwood Grove',
			'chemical-feedstock-well': 'Chemical Feedstock Well',
			'flour-mill': 'Flour Mill',
			'oil-press': 'Oil Press',
			'water-filtration-plant': 'Water Filtration Plant',
			'syrup-plant': 'Syrup Plant',
			'pulp-mill': 'Pulp Mill',
			'plastic-plant': 'Plastic Plant',
			'packaging-plant': 'Packaging Plant',
			'chemical-plant': 'Chemical Plant',
			'snack-factory': 'Snack Factory',
			'drink-bottling-plant': 'Drink Bottling Plant',
			'household-goods-factory': 'Household Goods Factory',
			'gift-workshop': 'Gift Workshop',
			'water-bottler': 'Water Bottler',
			'produce-packhouse': 'Produce Packhouse',
			'pantry-works': 'Pantry Works',
			warehouse: 'Warehouse'
		},
		industryResources: {
			'grain-field': 'Grain Field',
			'salt-deposit': 'Salt Deposit',
			'oilseed-field': 'Oilseed Field',
			'water-source': 'Water Source',
			'fruit-orchard': 'Fruit Orchard',
			'sugar-field': 'Sugar Field',
			'pulpwood-forest': 'Pulpwood Forest',
			'chemical-feedstock': 'Chemical Feedstock'
		},
		neighborhoods: {
			downtown: 'Downtown',
			campus: 'Campus',
			residential: 'Residential',
			mall: 'Mall',
			transit: 'Transit',
			industrial: 'Industrial',
			suburb: 'Suburb',
			parkEdge: 'Park Edge'
		},
		terrain: {
			commercial: 'Commercial',
			residential: 'Residential',
			green: 'Green',
			transit: 'Transit',
			industrial: 'Industrial'
		},
		industryTerrain: {
			farmland: 'Farmland',
			forest: 'Forest',
			water: 'Water',
			deposit: 'Deposit',
			industrial: 'Industrial',
			blocked: 'Blocked'
		},
		policyFields: {
			pricing: 'Pricing',
			inventory: 'Inventory',
			staffing: 'Staffing',
			marketing: 'Marketing',
			service: 'Service'
		},
		policyValues: {
			pricing: {
				discount: 'Discount',
				competitive: 'Competitive',
				standard: 'Standard',
				premium: 'Premium'
			},
			inventory: {
				lean: 'Lean',
				balanced: 'Balanced',
				generous: 'Generous'
			},
			staffing: {
				minimal: 'Minimal',
				efficient: 'Efficient',
				service: 'Service'
			},
			marketing: {
				none: 'None',
				awareness: 'Awareness',
				promotions: 'Promotions',
				loyalty: 'Loyalty'
			},
			service: {
				speed: 'Speed',
				balanced: 'Balanced',
				highTouch: 'High Touch'
			}
		},
		scoreKeys: {
			profit: 'Profit',
			customerSatisfaction: 'Customer Satisfaction',
			staffMorale: 'Staff Morale',
			marketPosition: 'Market Position'
		},
		worldCities: {
			'harbor-city': {
				name: 'Harbor City',
				unlockRequirement: 'Starter retail city',
				specialtySummary: 'Balanced starter market with steady everyday demand.'
			},
			'campus-junction': {
				name: 'Campus Junction',
				unlockRequirement: 'Reach 2 stores or day 7.',
				specialtySummary:
					'Student-heavy districts favor electronics, games, accessories, and gifts.'
			},
			'garden-borough': {
				name: 'Garden Borough',
				unlockRequirement: 'Reach 4 stores or hold positive cash after daily reports.',
				specialtySummary:
					'Residential neighborhoods favor groceries, essentials, and convenience goods.'
			},
			'industry-city': {
				name: 'Industry City',
				unlockRequirement: 'Starter industrial city',
				specialtySummary: 'Balanced starter resources with broad processing room.'
			},
			'breadbasket-basin': {
				name: 'Breadbasket Basin',
				unlockRequirement: 'Build a warehouse and one raw producer.',
				specialtySummary: 'Food-chain resource basin for grain, oilseeds, fruit, and sugar.'
			},
			'quarry-works': {
				name: 'Quarry Works',
				unlockRequirement: 'Produce a finished material locally.',
				specialtySummary:
					'Extraction and factory district for salt, chemicals, pulpwood, and packaging chains.'
			}
		},
		mapViews: {
			world: 'World',
			retail: 'Retail',
			industry: 'Industry'
		},
		managementPanels: {
			dashboard: 'Dashboard',
			policies: 'Policies',
			staff: 'Staff',
			stores: 'Stores',
			decisions: 'Decisions',
			reports: 'Reports',
			productChains: 'Product Chains'
		}
	},
	copy: {
		stockStatus: {
			healthy: 'Healthy',
			needsImport: 'Needs import',
			outOfStock: 'Out of stock'
		},
		stockTrouble: {
			outOfStock: {
				one: '{count} product out of stock',
				other: '{count} products out of stock'
			},
			needsImport: {
				one: '{count} product needs import',
				other: '{count} products need import'
			}
		},
		alerts: {
			storeStock: '{storeName}: {summary}',
			decision: 'Decision: {title}',
			factoryBlocked: '{buildingName} starved of inputs'
		},
		worldCity: {
			kind: {
				retail: 'Retail',
				industry: 'Industry'
			},
			state: {
				opened: 'Opened',
				revealed: 'Ready to open',
				locked: 'Locked'
			},
			blockedOpeningCost: 'Opening this city requires {cash} cash.',
			openedSummary: '{storeCount} stores - {buildingCount} industrial buildings'
		},
		decisions: {
			cashPressure: {
				title: 'Cash pressure',
				context:
					'Cash is below zero. Choose how to keep operations moving while protecting the brand.',
				options: {
					'short-loan': {
						label: 'Short loan',
						description: 'Add emergency working capital and accept pressure on profitability.'
					},
					'cut-costs': {
						label: 'Cut costs',
						description: 'Trim discretionary spend and inventory depth to stabilize cash.'
					},
					'hold-course': {
						label: 'Hold course',
						description: "Avoid reactive changes and let tomorrow's sales carry the business."
					}
				}
			},
			expansionOpportunity: {
				title: 'Expansion opportunity',
				context: 'Strong profit and cash reserves make a second storefront plausible.',
				options: {
					prepare: {
						label: 'Prepare',
						description: 'Start scouting locations and lining up the opening plan.'
					},
					pass: {
						label: 'Pass',
						description: 'Keep capital focused on the current store.'
					}
				}
			},
			supplierTerms: {
				title: 'Supplier terms',
				context:
					'A supplier is open to revising ordering terms before the next replenishment cycle.',
				options: {
					'negotiate-credit': {
						label: 'Negotiate credit',
						description: 'Stretch payment timing for a small margin penalty.'
					},
					'bulk-discount': {
						label: 'Bulk discount',
						description: 'Commit to larger orders for better unit economics.'
					}
				}
			},
			acknowledge: {
				label: 'Acknowledge',
				description: 'Return to operations planning.'
			}
		},
		productChainGraph: {
			title: {
				warehouseFlow: 'Warehouse flow',
				productChain: 'Product chain'
			},
			warehouseNode: 'Warehouse',
			health: {
				healthy: 'Healthy',
				watch: 'Watch',
				shortage: 'Shortage',
				'no-local-capacity': 'No local capacity',
				'no-report': 'No report yet'
			},
			emptyReason: {
				noWarehouseData: 'No warehouse stock or daily report yet.',
				noLocalChain: 'No local production chain available for this category yet.'
			},
			warnings: {
				noDailyReport: 'No daily report yet; latest-day flow is unavailable.'
			},
			edges: {
				in: '{quantity}/day in',
				out: '{quantity}/day out',
				produced: '{actual}/day produced · {required}/cycle',
				used: '{actual}/day used · {required}/cycle',
				producedImported: '{actual}/day produced · {required}/cycle · import',
				usedImported: '{actual}/day used · {required}/cycle · import'
			},
			bottlenecks: {
				healthy: '{label} is flowing locally.',
				watch: '{label} stock is below latest downstream use.',
				shortage: '{label} relied on imports or had a local shortage today.',
				noLocalCapacity: '{label} has no placed local producer.',
				noReport: '{label} has no latest daily flow yet.',
				warehouseNoCapacity: 'No warehouse capacity is available.',
				warehouseOverflow: '{quantity} units are in overflow storage.',
				warehouseAvailable: 'Warehouse capacity is available.'
			}
		}
	}
} as const;
