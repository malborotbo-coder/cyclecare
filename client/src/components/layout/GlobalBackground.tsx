import workshopBg from "@assets/generated_images/bike_repair_workshop_background.png";

export default function GlobalBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${workshopBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "scroll",
        }}
      />
      <div className="absolute inset-0 bg-black/35" />
    </div>
  );
}
