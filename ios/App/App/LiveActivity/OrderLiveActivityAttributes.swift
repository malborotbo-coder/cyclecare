import ActivityKit
import Foundation

@available(iOS 16.1, *)
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
  var role: String?
}
