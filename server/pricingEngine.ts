import type { PricingBreakdown } from "@shared/bookingTypes";

type PricingInput = {
  serviceBase?: number;
  serviceId?: string;
  serviceName?: string;
  distanceKm?: number;
  parts?: Array<{ id?: string; name: string; quantity: number; unitPrice: number }>;
  installAccessory?: boolean;
  installSpare?: boolean;
  config?: Partial<typeof defaultConfig>;
};

const defaultConfig = {
  serviceBase: 150, // periodic maintenance
  delivery: {
    base: 10,
    perKm: 2,
    min: 10,
    max: 60,
  },
  install: {
    accessory: 25,
    spare: 60,
  },
  vatRate: 0.15,
  breakdownVersion: "v1",
};

export function computePricing(input: PricingInput): PricingBreakdown {
  const cfg = {
    ...defaultConfig,
    ...input.config,
    delivery: { ...defaultConfig.delivery, ...(input.config?.delivery || {}) },
    install: { ...defaultConfig.install, ...(input.config?.install || {}) },
  };

  const serviceBase = input.serviceBase ?? cfg.serviceBase;
  const distanceKm = Math.max(0, input.distanceKm ?? 0);

  // Parts
  const partsItems = (input.parts || []).map((p) => ({
    id: p.id,
    name: p.name,
    quantity: p.quantity,
    unitPrice: p.unitPrice,
    total: p.quantity * p.unitPrice,
  }));
  const partsTotal = partsItems.reduce((sum, item) => sum + item.total, 0);

  // Installation
  const installAccessory = input.installAccessory ? cfg.install.accessory : 0;
  const installSpare = input.installSpare ? cfg.install.spare : 0;
  const installTotal = installAccessory + installSpare;

  // Delivery
  const deliveryRaw = cfg.delivery.base + distanceKm * cfg.delivery.perKm;
  const deliveryTotal = Math.min(Math.max(deliveryRaw, cfg.delivery.min), cfg.delivery.max);

  const subtotal = serviceBase + partsTotal + installTotal + deliveryTotal;
  const vat = Number((subtotal * cfg.vatRate).toFixed(2));
  const total = Number((subtotal + vat).toFixed(2));

  const breakdown: PricingBreakdown = {
    service: {
      id: input.serviceId,
      name: input.serviceName,
      base: Number(serviceBase.toFixed(2)),
    },
    parts: {
      items: partsItems,
      total: Number(partsTotal.toFixed(2)),
    },
    install: {
      accessoryFee: Number(installAccessory.toFixed(2)),
      sparePartFee: Number(installSpare.toFixed(2)),
      total: Number(installTotal.toFixed(2)),
    },
    delivery: {
      base: cfg.delivery.base,
      perKm: cfg.delivery.perKm,
      distanceKm: Number(distanceKm.toFixed(2)),
      total: Number(deliveryTotal.toFixed(2)),
      min: cfg.delivery.min,
      max: cfg.delivery.max,
    },
    subtotal: Number(subtotal.toFixed(2)),
    vatRate: cfg.vatRate * 100,
    vat,
    total,
    breakdownVersion: cfg.breakdownVersion,
  };

  return breakdown;
}
