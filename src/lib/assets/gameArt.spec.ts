import { describe, expect, it } from 'vitest';
import { SHOP_STOREFRONT_ALT, SHOP_STOREFRONT_PATH, SHOP_STOREFRONT_TEXTURE_KEY } from './gameArt';

describe('game art asset constants', () => {
	it('defines the first shop storefront asset contract', () => {
		expect(SHOP_STOREFRONT_PATH).toBe('/assets/game/shops/anime-storefront.png');
		expect(SHOP_STOREFRONT_TEXTURE_KEY).toBe('shop-storefront');
		expect(SHOP_STOREFRONT_ALT).toBe('Anime-style storefront for an owned shop');
	});
});
