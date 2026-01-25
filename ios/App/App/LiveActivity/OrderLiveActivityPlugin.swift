import Capacitor
import Foundation

@objc(OrderLiveActivity)
public class OrderLiveActivityPlugin: CAPPlugin {
  @objc func start(_ call: CAPPluginCall) {
    guard #available(iOS 16.1, *) else {
      call.reject("Live Activities require iOS 16.1+")
      return
    }

    guard let orderId = call.getString("orderId"), let orderNumber = call.getString("orderNumber") else {
      call.reject("orderId and orderNumber are required")
      return
    }

    let status = call.getString("status") ?? "pending"
    let title = call.getString("title") ?? ""
    let subtitle = call.getString("subtitle") ?? ""
    let progress = call.getDouble("progress") ?? 0
    let stageIndex = call.getInt("stageIndex") ?? 0
    let totalStages = call.getInt("totalStages") ?? 4
    let timestamp = call.getDouble("timestamp") ?? Date().timeIntervalSince1970
    let technicianName = call.getString("technicianName")
    let etaMinutes = call.getInt("etaMinutes")
    let locale = call.getString("locale") ?? Locale.current.languageCode ?? "en"
    let bikeName = call.getString("bikeName")
    let userId = call.getString("userId")

    let state = OrderLiveActivityAttributes.ContentState(
      status: status,
      title: title,
      subtitle: subtitle,
      progress: progress,
      stageIndex: stageIndex,
      totalStages: totalStages,
      timestamp: timestamp,
      technicianName: technicianName,
      etaMinutes: etaMinutes,
      locale: locale
    )

    OrderLiveActivityManager.shared.start(
      orderId: orderId,
      orderNumber: orderNumber,
      bikeName: bikeName,
      userId: userId,
      state: state
    )

    call.resolve()
  }

  @objc func update(_ call: CAPPluginCall) {
    guard #available(iOS 16.1, *) else {
      call.reject("Live Activities require iOS 16.1+")
      return
    }

    guard let orderId = call.getString("orderId") else {
      call.reject("orderId is required")
      return
    }

    let status = call.getString("status") ?? "pending"
    let title = call.getString("title") ?? ""
    let subtitle = call.getString("subtitle") ?? ""
    let progress = call.getDouble("progress") ?? 0
    let stageIndex = call.getInt("stageIndex") ?? 0
    let totalStages = call.getInt("totalStages") ?? 4
    let timestamp = call.getDouble("timestamp") ?? Date().timeIntervalSince1970
    let technicianName = call.getString("technicianName")
    let etaMinutes = call.getInt("etaMinutes")
    let locale = call.getString("locale") ?? Locale.current.languageCode ?? "en"

    let state = OrderLiveActivityAttributes.ContentState(
      status: status,
      title: title,
      subtitle: subtitle,
      progress: progress,
      stageIndex: stageIndex,
      totalStages: totalStages,
      timestamp: timestamp,
      technicianName: technicianName,
      etaMinutes: etaMinutes,
      locale: locale
    )

    OrderLiveActivityManager.shared.update(orderId: orderId, state: state)
    call.resolve()
  }

  @objc func end(_ call: CAPPluginCall) {
    guard #available(iOS 16.1, *) else {
      call.reject("Live Activities require iOS 16.1+")
      return
    }

    guard let orderId = call.getString("orderId") else {
      call.reject("orderId is required")
      return
    }

    let status = call.getString("status") ?? "completed"
    let title = call.getString("title") ?? ""
    let subtitle = call.getString("subtitle") ?? ""
    let progress = call.getDouble("progress") ?? 1
    let stageIndex = call.getInt("stageIndex") ?? 3
    let totalStages = call.getInt("totalStages") ?? 4
    let timestamp = call.getDouble("timestamp") ?? Date().timeIntervalSince1970
    let technicianName = call.getString("technicianName")
    let etaMinutes = call.getInt("etaMinutes")
    let locale = call.getString("locale") ?? Locale.current.languageCode ?? "en"

    let state = OrderLiveActivityAttributes.ContentState(
      status: status,
      title: title,
      subtitle: subtitle,
      progress: progress,
      stageIndex: stageIndex,
      totalStages: totalStages,
      timestamp: timestamp,
      technicianName: technicianName,
      etaMinutes: etaMinutes,
      locale: locale
    )

    OrderLiveActivityManager.shared.end(orderId: orderId, state: state)
    call.resolve()
  }
}
