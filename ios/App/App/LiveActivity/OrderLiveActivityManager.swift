import ActivityKit
import Foundation

@available(iOS 16.1, *)
final class OrderLiveActivityManager {
  static let shared = OrderLiveActivityManager()

  private let apiBase = "https://cyclecaretec.com/api"
  private let storagePrefix = "CapacitorStorage."
  private let apnsEnvironment: String = {
#if DEBUG
    return "development"
#else
    return "production"
#endif
  }()

  private func readStoredValue(_ key: String) -> String? {
    let fullKey = storagePrefix + key
    return UserDefaults.standard.string(forKey: fullKey)
  }

  private func readAuthToken() -> String? {
    if let token = readStoredValue("auth_token"), !token.isEmpty { return token }
    if let token = readStoredValue("phone_session"), !token.isEmpty { return token }
    if let token = readStoredValue("firebase_token"), !token.isEmpty { return token }
    return nil
  }

  private func findActivity(orderId: String) -> Activity<OrderLiveActivityAttributes>? {
    return Activity<OrderLiveActivityAttributes>.activities.first { $0.attributes.orderId == orderId }
  }

  func start(orderId: String,
             orderNumber: String,
             bikeName: String?,
             role: String?,
             userId: String?,
             state: OrderLiveActivityAttributes.ContentState) {
    if let existing = findActivity(orderId: orderId) {
      update(orderId: orderId, state: state)
      return
    }

    let attributes = OrderLiveActivityAttributes(
      orderId: orderId,
      orderNumber: orderNumber,
      bikeName: bikeName,
      role: role
    )

    do {
      let activity = try Activity.request(
        attributes: attributes,
        contentState: state,
        pushType: .token
      )
      observePushTokenUpdates(
        activity: activity,
        orderId: orderId,
        orderNumber: orderNumber,
        userId: userId,
        activityId: activity.id
      )
    } catch {
      print("[LiveActivity] Failed to start activity:", error)
    }
  }

  func update(orderId: String, state: OrderLiveActivityAttributes.ContentState) {
    guard let activity = findActivity(orderId: orderId) else { return }
    Task {
      await activity.update(using: state)
    }
  }

  func end(orderId: String, state: OrderLiveActivityAttributes.ContentState) {
    guard let activity = findActivity(orderId: orderId) else { return }
    Task {
      await activity.end(using: state, dismissalPolicy: .immediate)
    }
  }

  private func observePushTokenUpdates(activity: Activity<OrderLiveActivityAttributes>,
                                       orderId: String,
                                       orderNumber: String,
                                       userId: String?,
                                       activityId: String) {
    Task.detached {
      for await tokenData in activity.pushTokenUpdates {
        let token = tokenData.map { String(format: "%02x", $0) }.joined()
        await self.registerLiveActivityToken(
          orderId: orderId,
          orderNumber: orderNumber,
          userId: userId,
          token: token,
          activityId: activityId
        )
      }
    }
  }

  private func registerLiveActivityToken(orderId: String,
                                         orderNumber: String,
                                         userId: String?,
                                         token: String,
                                         activityId: String) async {
    guard let authToken = readAuthToken() else {
      print("[LiveActivity] Skipped: no auth token yet")
      return
    }

    guard let url = URL(string: "\(apiBase)/live-activities/register") else {
      return
    }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")

    var payload: [String: Any] = [
      "orderId": orderId,
      "orderNumber": orderNumber,
      "token": token,
      "activityId": activityId,
      "environment": apnsEnvironment,
    ]
    if let userId, !userId.isEmpty {
      payload["userId"] = userId
    }

    do {
      request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])
      let (_, response) = try await URLSession.shared.data(for: request)
      if let http = response as? HTTPURLResponse {
        print("[LiveActivity] Token register status: \(http.statusCode)")
      }
    } catch {
      print("[LiveActivity] Token register failed:", error)
    }
  }
}
