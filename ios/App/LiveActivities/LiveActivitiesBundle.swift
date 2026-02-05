import ActivityKit
import WidgetKit
import SwiftUI

@main
struct LiveActivitiesBundle: WidgetBundle {
  var body: some Widget {
    OrderLiveActivityWidget()
  }
}

struct OrderLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: OrderLiveActivityAttributes.self) { context in
      LiveActivityLockScreenView(context: context)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(alignment: .leading, spacing: 2) {
            Text("Cycle Care")
              .font(.caption2)
              .foregroundStyle(.secondary)
            Text(context.attributes.orderNumber)
              .font(.caption)
              .bold()
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          VStack(alignment: .trailing, spacing: 2) {
            Text(context.state.status.uppercased())
              .font(.caption2)
              .foregroundStyle(.secondary)
            Text(progressLabel(context))
              .font(.caption)
              .bold()
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 6) {
            Text(context.state.title)
              .font(.subheadline)
              .bold()
            Text(context.state.subtitle)
              .font(.caption)
              .foregroundStyle(.secondary)
            LiveActivityProgressBar(progress: context.state.progress)
          }
        }
      } compactLeading: {
        Text(progressLabel(context))
          .font(.caption2)
          .bold()
      } compactTrailing: {
        Text(shortStatus(context))
          .font(.caption2)
      } minimal: {
        Text(shortStatus(context))
          .font(.caption2)
      }
    }
  }

  private func shortStatus(_ context: ActivityViewContext<OrderLiveActivityAttributes>) -> String {
    let status = context.state.status
    if status.count <= 3 { return status.uppercased() }
    return String(status.prefix(3)).uppercased()
  }

  private func progressLabel(_ context: ActivityViewContext<OrderLiveActivityAttributes>) -> String {
    let percent = Int((context.state.progress * 100).rounded())
    return "\(percent)%"
  }
}

struct LiveActivityLockScreenView: View {
  let context: ActivityViewContext<OrderLiveActivityAttributes>

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        VStack(alignment: .leading, spacing: 4) {
          Text(context.state.title)
            .font(.headline)
            .bold()
          Text(context.state.subtitle)
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        Spacer()
        Text(context.attributes.orderNumber)
          .font(.caption)
          .padding(.horizontal, 8)
          .padding(.vertical, 4)
          .background(.thinMaterial)
          .clipShape(Capsule())
      }

      LiveActivityProgressBar(progress: context.state.progress)

      HStack(spacing: 8) {
        if let name = context.state.technicianName, !name.isEmpty {
          Text(name)
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        if let eta = context.state.etaMinutes {
          Text("ETA \(eta) min")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }
    }
    .padding(.vertical, 4)
  }
}

struct LiveActivityProgressBar: View {
  let progress: Double

  var body: some View {
    GeometryReader { proxy in
      ZStack(alignment: .leading) {
        Capsule()
          .fill(Color.secondary.opacity(0.2))
        Capsule()
          .fill(Color.accentColor)
          .frame(width: max(6, proxy.size.width * CGFloat(min(max(progress, 0), 1))))
      }
    }
    .frame(height: 6)
  }
}
