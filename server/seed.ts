import { storage } from "./storage";

async function seed() {
  try {
    console.log("Seeding database...");

    // Seed parts
    const partsData = [
      // Tires
      { name: "إطار Continental Grand Prix 5000", nameEn: "Continental Grand Prix 5000", category: "tires", price: "280", inStock: true },
      { name: "إطار Schwalbe Marathon", nameEn: "Schwalbe Marathon", category: "tires", price: "220", inStock: true },
      { name: "إطار Michelin Power Road", nameEn: "Michelin Power Road", category: "tires", price: "250", inStock: false },
      
      // Chains
      { name: "سلسلة Shimano HG601", nameEn: "Shimano HG601 Chain", category: "chains", price: "150", inStock: true },
      { name: "سلسلة KMC X11", nameEn: "KMC X11 Chain", category: "chains", price: "180", inStock: true },
      
      // Brakes
      { name: "فرامل Shimano Dura-Ace", nameEn: "Shimano Dura-Ace Brakes", category: "brakes", price: "450", inStock: true },
      { name: "فرامل SRAM Red", nameEn: "SRAM Red Brakes", category: "brakes", price: "420", inStock: true },
    ];

    for (const part of partsData) {
      await storage.createPart(part);
    }

    console.log(`✅ Seeded ${partsData.length} parts`);
    console.log("Database seeded successfully!");
  } catch (error) {
    console.error("Error seeding database:", error);
    process.exit(1);
  }
}

seed();
