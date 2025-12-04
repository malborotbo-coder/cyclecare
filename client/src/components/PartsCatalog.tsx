import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, ShoppingCart, Package } from "lucide-react";
import maintenanceImage from "@assets/generated_images/Bike_maintenance_close-up_d3f91622.png";
import type { Part } from "@shared/schema";
import { useLanguage } from "@/contexts/LanguageContext";
import LanguageToggle from "@/components/LanguageToggle";
import ThemeToggle from "@/components/ThemeToggle";
import Logo from "@/components/Logo";
import { useCart } from "@/contexts/CartContext";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

interface PartCardProps {
  part: Part;
  onAddToCart: (part: Part) => void;
}

function PartCard({ part, onAddToCart }: PartCardProps) {
  const { lang } = useLanguage();
  const t = {
    ar: { inStock: "متوفر", outOfStock: "غير متوفر", addToCart: "أضف للسلة" },
    en: {
      inStock: "In Stock",
      outOfStock: "Out of Stock",
      addToCart: "Add to Cart",
    },
  };

  return (
    <Card
      className="hover-elevate cursor-pointer"
      data-testid={`card-part-${part.id}`}
    >
      <CardContent className="p-4">
        <div className="aspect-square bg-muted rounded-md mb-3 flex items-center justify-center overflow-hidden">
          {part.imageUrl ? (
            <img
              src={part.imageUrl}
              alt={part.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <Package className="w-12 h-12 text-muted-foreground" />
          )}
        </div>
        <h3 className="font-semibold mb-1 line-clamp-2">
          {lang === "ar" ? part.name : part.nameEn}
        </h3>
        <div className="flex items-center justify-between mt-2 gap-2">
          <span className="text-lg font-bold text-primary">{part.price}</span>
          <Badge variant={part.inStock ? "default" : "secondary"}>
            {part.inStock
              ? t[lang as keyof typeof t].inStock
              : t[lang as keyof typeof t].outOfStock}
          </Badge>
        </div>
        <Button
          className="w-full mt-3"
          size="sm"
          disabled={!part.inStock}
          onClick={() => onAddToCart(part)}
          data-testid={`button-add-${part.id}`}
        >
          <ShoppingCart className="w-4 h-4 ml-2" />
          {t[lang as keyof typeof t].addToCart}
        </Button>
      </CardContent>
    </Card>
  );
}

const categoryLabels: Record<string, { ar: string; en: string }> = {
  all: { ar: "الكل", en: "All" },
  brakes: { ar: "فرامل", en: "Brakes" },
  chains: { ar: "سلاسل", en: "Chains" },
  tires: { ar: "إطارات", en: "Tires" },
  wheels: { ar: "عجلات", en: "Wheels" },
  seats: { ar: "مقاعد", en: "Seats" },
  handlebars: { ar: "مقود", en: "Handlebars" },
  pedals: { ar: "دواسات", en: "Pedals" },
  lights: { ar: "أضواء", en: "Lights" },
  accessories: { ar: "إكسسوارات", en: "Accessories" },
  parts: { ar: "قطع غيار", en: "Parts" },
};

export default function PartsCatalog() {
  const { lang: language, toggleLanguage } = useLanguage();
  const { addItem } = useCart();
  const { toast } = useToast();

  const t = {
    ar: {
      title: "المنتجات",
      subtitle: "قطع أصلية عالية الجودة",
      searchPlaceholder: "ابحث عن المنتجات...",
      loading: "جاري التحميل...",
      noProducts: "لا توجد منتجات",
      availability: {
        inStock: "متوفر",
        outOfStock: "غير متوفر",
      },
      addToCart: "أضف للسلة",
      addedToCart: "تمت إضافة المنتج للسلة",
      currency: "ر.س",
    },
    en: {
      title: "Products",
      subtitle: "Original high quality parts",
      searchPlaceholder: "Search for products...",
      loading: "Loading...",
      noProducts: "No products available",
      availability: {
        inStock: "In Stock",
        outOfStock: "Out of Stock",
      },
      addToCart: "Add to Cart",
      addedToCart: "Added to cart",
      currency: "SAR",
    },
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const { data: parts, isLoading } = useQuery<Part[]>({
    queryKey: ["/api/parts"],
  });

  const uniqueCategories = useMemo(() => {
    if (!parts || parts.length === 0) return ["all"];
    const cats = new Set(parts.map((p) => p.category.toLowerCase()));
    return ["all", ...Array.from(cats)];
  }, [parts]);

  const filteredParts = useMemo(() => {
    return (
      parts?.filter((part) => {
        const matchesSearch =
          part.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          part.nameEn.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory =
          selectedCategory === "all" ||
          part.category.toLowerCase() === selectedCategory;
        return matchesSearch && matchesCategory;
      }) || []
    );
  }, [parts, searchQuery, selectedCategory]);

  const getCategoryLabel = (cat: string) => {
    const normalizedCat = cat.toLowerCase();
    const labels = categoryLabels[normalizedCat];
    if (labels) {
      return language === "ar" ? labels.ar : labels.en;
    }
    return cat.charAt(0).toUpperCase() + cat.slice(1);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-[100] bg-primary/90 backdrop-blur-md text-white border-b border-white/10 shadow-lg">
        <div className="container mx-auto px-4 py-2 flex items-center justify-between gap-2">
          <Logo size="sm" />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LanguageToggle currentLang={language} onToggle={toggleLanguage} />
          </div>
        </div>
      </header>

      <div
        className="relative h-48 bg-cover bg-center"
        style={{ backgroundImage: `url(${maintenanceImage})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/30"></div>
        <div className="relative h-full container mx-auto px-4 flex flex-col justify-end pb-8">
          <h1
            className="text-3xl font-bold text-white mb-2"
            data-testid="heading-products-title"
          >
            {t[language].title}
          </h1>
          <p className="text-white/90">{t[language].subtitle}</p>
        </div>
      </div>

      <div className="container mx-auto px-4 -mt-6 pb-8">
        <div className="relative mb-6">
          <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            type="search"
            placeholder={t[language].searchPlaceholder}
            className="pr-10 h-12"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search"
          />
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="text-muted-foreground">{t[language].loading}</div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-6">
              {uniqueCategories.map((cat) => (
                <Button
                  key={cat}
                  variant={selectedCategory === cat ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(cat)}
                  data-testid={`tab-${cat}`}
                >
                  {getCategoryLabel(cat)}
                </Button>
              ))}
            </div>

            {filteredParts.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {t[language].noProducts}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {filteredParts.map((part) => (
                  <PartCard
                    key={part.id}
                    part={part}
                    onAddToCart={(p) => {
                      addItem(p, 1);
                      toast({ title: t[language].addedToCart });
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
