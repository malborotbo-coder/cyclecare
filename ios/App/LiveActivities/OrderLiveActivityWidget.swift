import ActivityKit
import SwiftUI
import WidgetKit

struct OrderLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: OrderLiveActivityAttributes.self) { context in
      OrderLiveActivityLockScreenView(context: context)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(alignment: .leading, spacing: 4) {
            Text("Cycle Care")
              .font(.caption).bold()
            Text("#\(context.attributes.orderNumber)")
              .font(.footnote)
          }
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(spacing: 4) {
            Text(context.state.title)
              .font(.caption).bold()
              .lineLimit(1)
            Text(context.state.subtitle)
              .font(.caption2)
              .lineLimit(2)
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          StageIconView(status: context.state.status)
        }
        DynamicIslandExpandedRegion(.bottom) {
          ProgressView(value: context.state.progress)
            .tint(Color.white)
        }
      } compactLeading: {
        StageIconView(status: context.state.status)
      } compactTrailing: {
        Text("\(Int(context.state.progress * 100))%")
          .font(.caption2)
      } minimal: {
        StageIconView(status: context.state.status)
      }
    }
  }
}

struct OrderLiveActivityLockScreenView: View {
  let context: ActivityViewContext<OrderLiveActivityAttributes>

  private var isArabic: Bool {
    context.state.locale.lowercased().hasPrefix("ar")
  }

  var body: some View {
    let layout = isArabic ? LayoutDirection.rightToLeft : LayoutDirection.leftToRight
    ZStack {
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .fill(LinearGradient(
          colors: [Color(red: 0.08, green: 0.12, blue: 0.18), Color(red: 0.12, green: 0.18, blue: 0.26)],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        ))
        .overlay(
          RoundedRectangle(cornerRadius: 20, style: .continuous)
            .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )

      VStack(alignment: .leading, spacing: 10) {
        header
        HStack(alignment: .center, spacing: 12) {
          BikeIllustrationView(status: context.state.status)
          VStack(alignment: .leading, spacing: 6) {
            Text(context.state.title)
              .font(.headline)
              .foregroundColor(.white)
              .lineLimit(1)
            Text(context.state.subtitle)
              .font(.subheadline)
              .foregroundColor(.white.opacity(0.85))
              .lineLimit(2)
          }
        }
        StageTimelineView(stageIndex: context.state.stageIndex)
        ProgressView(value: context.state.progress)
          .tint(Color.white)
      }
      .padding(16)
    }
    .environment(\.layoutDirection, layout)
  }

  private var header: some View {
    HStack {
      VStack(alignment: .leading, spacing: 4) {
        Text(isArabic ? "سايكل كير" : "Cycle Care")
          .font(.caption).bold()
          .foregroundColor(.white.opacity(0.8))
        Text("#\(context.attributes.orderNumber)")
          .font(.caption2)
          .foregroundColor(.white.opacity(0.6))
      }
      Spacer()
      StageIconView(status: context.state.status)
    }
  }
}

struct BikeIllustrationView: View {
  let status: String

  var body: some View {
    ZStack {
      Circle()
        .fill(LinearGradient(
          colors: [Color.white.opacity(0.15), Color.white.opacity(0.05)],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        ))
        .frame(width: 60, height: 60)

      Image(systemName: baseSymbol)
        .font(.system(size: 28, weight: .semibold))
        .foregroundColor(.white)

      if let overlay = overlaySymbol {
        Image(systemName: overlay)
          .font(.system(size: 14, weight: .bold))
          .foregroundColor(.white)
          .offset(x: 16, y: -16)
      }
    }
  }

  private var baseSymbol: String {
    switch status {
    case "completed":
      return "bicycle"
    case "working", "in_progress":
      return "wrench.and.screwdriver"
    case "on_the_way":
      return "figure.outdoor.cycle"
    case "accepted":
      return "bicycle"
    case "rejected_by_technician", "cancelled":
      return "bicycle"
    default:
      return "bicycle"
    }
  }

  private var overlaySymbol: String? {
    switch status {
    case "completed":
      return "sparkles"
    case "working", "in_progress":
      return "gearshape.fill"
    case "on_the_way":
      return "location.fill"
    case "accepted":
      return "checkmark.circle.fill"
    case "rejected_by_technician", "cancelled":
      return "xmark.circle.fill"
    default:
      return nil
    }
  }
}

struct StageTimelineView: View {
  let stageIndex: Int

  private let stages: [(String, String)] = [
    ("checkmark.circle.fill", "accepted"),
    ("figure.outdoor.cycle", "on_the_way"),
    ("wrench.and.screwdriver", "started"),
    ("sparkles", "completed")
  ]

  var body: some View {
    HStack(spacing: 8) {
      ForEach(Array(stages.enumerated()), id: \.offset) { item in
        let index = item.offset
        let stage = item.element
        HStack(spacing: 6) {
          Image(systemName: stage.0)
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(index <= stageIndex ? .white : .white.opacity(0.3))
          if index < stages.count - 1 {
            Capsule()
              .fill(index < stageIndex ? Color.white.opacity(0.8) : Color.white.opacity(0.2))
              .frame(height: 2)
              .frame(maxWidth: .infinity)
          }
        }
      }
    }
  }
}

struct StageIconView: View {
  let status: String

  var body: some View {
    Image(systemName: symbolName)
      .font(.system(size: 16, weight: .bold))
      .foregroundColor(.white)
  }

  private var symbolName: String {
    switch status {
    case "completed":
      return "sparkles"
    case "working", "in_progress":
      return "wrench.and.screwdriver"
    case "on_the_way":
      return "figure.outdoor.cycle"
    case "accepted":
      return "checkmark.circle.fill"
    case "rejected_by_technician", "cancelled":
      return "xmark.circle.fill"
    default:
      return "bicycle"
    }
  }
}
