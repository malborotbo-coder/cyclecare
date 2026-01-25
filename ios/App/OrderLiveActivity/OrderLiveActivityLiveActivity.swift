import ActivityKit
import WidgetKit
import SwiftUI

struct OrderLiveActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var status: String
    var title: String
    var subtitle: String
    var progress: Double
    var stageIndex: Int
    var totalStages: Int
    var timestamp: Double
    var technicianName: String?
    var etaMinutes: Int?
    var locale: String
  }

  var orderId: String
  var orderNumber: String
  var bikeName: String?
}

struct OrderLiveActivityLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: OrderLiveActivityAttributes.self) { context in
      VStack(alignment: .leading, spacing: 6) {
        Text("Cycle Care")
          .font(.caption)
          .foregroundColor(.secondary)
        Text("#\(context.attributes.orderNumber)")
          .font(.headline)
        Text(context.state.title)
          .font(.subheadline)
          .lineLimit(1)
        Text(context.state.subtitle)
          .font(.caption)
          .foregroundColor(.secondary)
          .lineLimit(1)
        ProgressView(value: context.state.progress)
          .progressViewStyle(.linear)
      }
      .padding(.vertical, 10)
      .padding(.horizontal, 12)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Text("Order")
            .font(.caption2)
            .foregroundColor(.secondary)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(context.attributes.orderNumber)
            .font(.caption)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 4) {
            Text(context.state.title)
              .font(.caption)
              .lineLimit(1)
            ProgressView(value: context.state.progress)
              .progressViewStyle(.linear)
          }
        }
      } compactLeading: {
        Text("CC")
          .font(.caption2)
      } compactTrailing: {
        Text(context.state.status.prefix(1))
          .font(.caption2)
      } minimal: {
        Text("CC")
          .font(.caption2)
      }
    }
  }
}
